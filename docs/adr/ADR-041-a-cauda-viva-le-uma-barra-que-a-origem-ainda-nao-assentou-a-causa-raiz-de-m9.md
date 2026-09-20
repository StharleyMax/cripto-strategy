# ADR-041 — A cauda viva lê uma barra que a origem **ainda não terminou de agregar**: a causa-raiz de `[M-9]`, e ela é o OFFSET do poll

**Data:** 2026-09-20 · **Status:** proposta · **SPEC:** [`SPEC-008`](../specs/SPEC-008-candle-real-e-eixo-unico.md) `[M-9]`/`A-8`, com efeito em [`SPEC-007`](../specs/SPEC-007-cinco-metricas-do-core.md) (`klines_volume`)
**Fases:** `01` (vela real) — **é o que reprova o `DoD-9` dela** · **Componentes alvo:** `sentimento` (o coletor de klines)
**Origem:** `[M-9]` escalado por `SPEC-008` §1/`A-8`; reprovado no portão de fase em [`gates/FASE-01-qa.md`](../context/candle-real-e-eixo-unico/gates/FASE-01-qa.md) §1; pauta em [`handoff/DECISAO-ARQUITETO-M9.md`](../context/candle-real-e-eixo-unico/handoff/DECISAO-ARQUITETO-M9.md)
**Relação com decisões anteriores:** **sucede `ADR-034` na titularidade de `[M-9]`**, que `SPEC-008` §11 havia atribuído a `/architect` sob aquela ADR. ⛔ **Não toca `is_closed_bucket`** — o corte anti-lookahead de `RS-3.4` está **certo** e o sinal dele está sob teste; mexer nele seria consertar a peça errada.

---

## Contexto — o que estava medido, e o que faltava

`[M-9]`: `klines_volume` armazenado **subestima** a origem em **−2,2% a −4,5%**, `pos=0` em 4/4,
pior minuto **−69,6%** `[MEDIDO 2026-09-19, n=4 buckets × 240 min = 960 comparações]`. A hipótese
registrada era *"snapshot intrabarra gravado como `final_only`"*.

A fase `01` ganhou um `DoD` para **detectar a propagação** para o preço (`DoD-9`), e ele reprovou:

```
HIGH   pos=0  neg=9     ⛔ armazenado sempre ABAIXO da origem
LOW    pos=6  neg=0     ⛔ armazenado sempre ACIMA da origem
CLOSE  pos=37 neg=34    simétrico
```
`[MEDIDO 2026-09-20 pelo QA da fase 01, n=178 buckets por redução, 2 janelas disjuntas de 3 h;
34 divergências, 34 ESTREITANDO a faixa; P ≈ 2,3·10⁻¹⁰ sob sinal simétrico independente]`

**O que faltava era a causa, e as três explicações que estavam na mesa foram descartadas com
medição, antes desta ADR:** não é `build_klines_to_rows` (o backfill usa o mesmo código e
reproduz a origem ao centavo em 240/240 minutos), não é `LOCF` (as divergências são de células
**escritas**, `trace=live_tail`, não carregadas), e não é o `CLOSE` isoladamente.

---

## As medições — feitas na ORIGEM, com o banco fora do laço

⭐ **O que muda de qualidade aqui:** todas as medições anteriores compararam **o que
armazenamos** contra **o que a Binance diz hoje**. Isso confunde dois candidatos —
*"gravamos errado"* e *"lemos cedo"*. As duas abaixo tiram o nosso banco do laço inteiramente:
elas leem `/fapi/v1/klines` contra `/fapi/v1/klines`, a mesma barra, em instantes diferentes.

**M1 — a escada de assentamento: a origem CONTINUA MUDANDO uma barra que já declarou fechada.**

A mesma barra fechada, lida em `+2 / +5 / +10 / +30 s` depois de `bucket_end`, cada leitura
comparada contra uma referência em `+110 s`, campo a campo:

```
  rung    n    OPEN  HIGH  LOW  CLOSE  VOLUME     barras que DIFEREM da referencia
  + 2.0s  52     0     3    2     21      32        <= O QUE A PRODUCAO GRAVA HOJE
  + 5.0s  52     0     0    0      2       3        <= AINDA NAO LIMPO
  +10.0s  52     0     0    0      0       0        <= menor degrau LIMPO
  +30.0s  52     0     0    0      0       0
```

`[MEDIDO 2026-09-20T23:0x–23:3xZ, n=52 barras = 4 símbolos × 13 buckets de 1 min;
script `scratchpad/ladder.py`, saída bruta `scratchpad/ladder_out.json`, reproduzidos em
`docs/context/candle-real-e-eixo-unico/gates/DECISAO-M9-arquiteto.md`]`

⇒ **O offset do coletor é `2,0 s` (`_DEFAULT_KLINES_CYCLE_OFFSET_S`) e é exatamente a coluna que
diverge.** O **menor degrau LIMPO nos cinco campos é `+10 s`**.

⛔ **E o `+5 s` é a razão de a margem não ser retórica.** Nas primeiras `n=12` barras da escada o
degrau `+5 s` estava limpo em todos os campos, e eu cheguei a escrever `10,0` contra esse número.
Deixar a escada correr até `n=52` destapou as barras que **ainda se moviam em `+5 s`**. Um
bound tirado da primeira amostra que pareceu limpa teria entrado no repositório como medição, e a
amostra maior o refuta. **Está registrado aqui porque é o modo de errar, não um detalhe de
execução.**

**M2 — os CINCO sinais, medidos de uma vez, no par `+2 s` contra `+45 s`.** Sinal de
`leitura_em_+2s − leitura_assentada`:

```
  OPEN    pos= 0  neg= 0  zero=88     <= EXATO em 88/88 barras
  HIGH    pos= 0  neg= 6             <= so para BAIXO
  LOW     pos= 3  neg= 0             <= so para CIMA
  CLOSE   pos=13  neg=15             <= ATRAVESSA O ZERO
  VOLUME  pos= 0  neg=48             <= so para BAIXO
```

`[MEDIDO 2026-09-20T23:0x–23:2xZ, n=88 barras = 4 símbolos × 22 buckets; script
`scratchpad/probe.py`]`

⭐ **A direção foi PREDITA ANTES de ser contada** (§seguinte), então a probabilidade é
unilateral: sob sinal simétrico independente, `VOLUME` sair **48/48** no sentido predito tem
`P = 2⁻⁴⁸ ≈ 3,6·10⁻¹⁵`, e `HIGH` 6/6 mais `LOW` 3/3 somam `2⁻⁹ ≈ 2·10⁻³`. **`CLOSE` é o
controle interno**: é o único campo que o modelo de prefixo NÃO orienta, e é o único que
atravessa o zero (`13`/`15`). Um viés de instrumento apareceria nele também.

**São os mesmos cinco sinais que `[M-9]` e o `DoD-9` mediram no dado ARMAZENADO — reproduzidos
sem nunca tocar em `md.series`.**

---

## A causa — e ela é aritmética, não estatística

**A leitura em `+2 s` devolve um PREFIXO da sequência de negócios do bucket.** Sobre um prefixo
não-vazio `P` de uma sequência `S`:

| campo | relação | por quê |
|---|---|---|
| `open` | `open(P) = open(S)` | o primeiro negócio está em **todo** prefixo não-vazio |
| `high` | `high(P) <= high(S)` | máximo sobre subconjunto |
| `low` | `low(P) >= low(S)` | mínimo sobre subconjunto |
| `volume` | `vol(P) <= vol(S)` | soma de parcelas não-negativas sobre subconjunto |
| `close` | **sem relação de sinal** | é o último negócio VISTO; o verdadeiro pode estar acima ou abaixo |

⭐ **Isto não é uma hipótese compatível com os dados: é a única que PREDIZ os cinco sinais a
priori, e ela é falsificável por uma única barra.** Uma barra com `high(+2s) > high(+110s)` ou
`volume(+2s) > volume(+110s)` derruba o modelo de prefixo inteiro. **Em `n = 52` barras, zero
ocorrências.**

**E a correção da hipótese antiga importa, porque ela apontava para a peça errada.** `[M-9]`
dizia *"snapshot intrabarra gravado como `final_only`"*. O bucket **não** está em progresso: ele
fechou, e `is_closed_bucket` o classifica **corretamente** — o sinal daquele predicado está sob
teste (`test_collector_klines_mapping.py::test_the_in_progress_bucket_is_the_one_dropped_not_the_ones_around_it`)
e não é o defeito. **Quem ainda não terminou é a AGREGAÇÃO DA ORIGEM sobre um bucket já
fechado.** A diferença é o conserto inteiro: não se mexe no corte anti-lookahead; muda-se
**quando se olha**.

### Por que o erro é PERMANENTE, e não um transitório que se corrige sozinho

```python
watermark[symbol] = max(row.bucket_end for row in rows) - KLINES_BUCKET_WIDTH_MS
fresh = tuple(k for k in page.rows if seen is None or k.open_time_ms > seen)
```
`[DOC: collectors_cli.py, `_publish_klines_page`]` — a barra que abre em `T` é publicada
**exatamente uma vez**, no ciclo de `T + 60 s + 2 s`, e o ciclo seguinte a filtra. Somado a
`is_final=True` (`build_klines_to_rows`), o prefixo é o que `md.series` guarda **para sempre**.

⛔ **E re-ler não resolveria, o que fecha a alternativa mais óbvia:** o acessor escolhe
`argmin(observed_at)` dentro do bucket vencedor — *"the FIRST observation of that bucket, never
the last and never the definitive one"* (`ADR-006`/`D4.13`, `as_of_accessor.py:333-336`). Uma linha
de correção escrita depois **nunca seria servida**. Consertar pela re-leitura exigiria revogar
`D4.13`, que existe para impedir lookahead. **Consertar pela hora de olhar não exige revogar
nada.**

---

## Decisão

### `D1` — `_DEFAULT_KLINES_CYCLE_OFFSET_S` passa de `2,0 s` para `20,0 s`

`20,0` é **o dobro do menor degrau LIMPO** da escada (`+10 s`, `0/52` divergências nos cinco
campos). **O fator 2 é MARGEM, e está declarado como margem, não como medição** — assentamento é
propriedade da venue e ela não publica garantia sobre ele `[NÃO MEDIDO: a documentação da Binance
não declara janela de assentamento para `/fapi/v1/klines`]`. A escada cobriu ~26 minutos de
**um** regime de mercado; um regime mais volátil pode assentar mais devagar, e é exatamente para
isso que a margem serve.

⚠️ **Por que não `10,0`, que é o próprio bound:** um bound sem margem transforma qualquer barra
mais lenta que a amostra em um prefixo gravado para sempre. Por que não `30 s` ou mais: não
compra fidelidade nenhuma acima de `+10 s` (medido) e gasta relógio de parede à toa.

### `D2` — ⭐ A mudança custa ZERO fatia de latência servida, e isso é DERIVÁVEL, não esperado

Sob `final_only`, `use_cases/series_history._read_instant` pede `as_of` com
**`t = grid_instant + 60_000 − 1`** (`series_history.py:154`). `R-1` (`available_at <= t`) admite
a barra que fecha em `grid_instant` para **qualquer** offset abaixo de 60 s. ⇒ **a barra é
servida na MESMA fatia da grade em que era servida com `2,0`.**

O que muda é só relógio de parede: a linha chega a `md.series` **18 s depois**. Uma requisição
emitida dentro dessa janela de 18 s vê a vela mais nova aparecer até 18 s mais tarde. **Nenhum
`DoD` de latência desta feature mede essa janela** (os tetos de `[M-5]` são de quadro de pan e de
paginação), e `RNF-4` não é tocado: **zero chamada nova, zero cota** — é fase do mesmo ciclo.

### `D3` — O portão que impede `[M-9]` de voltar em silêncio é um TESTE, não um documento

`backend/tests/sentimento/test_collectors_cli_boot.py::test_the_klines_poll_fires_after_the_origin_has_settled_the_bar_never_before`
reprova se o offset cair abaixo de `KLINES_SETTLEMENT_BOUND_S = 10.0`, **com a razão na mensagem**.

**Por que este teste e não o `candle_fidelity_cli`:** o CLI é o instrumento certo para o
veredito, mas ele só roda **a mão**, contra a rede, e o QA da fase `01` registrou isso como
lacuna — *"enquanto rodar a mão, a regressão volta em silêncio"*. O teste roda em `make verify`,
é offline, e **nada mais na suíte pegaria a volta do `2.0`**: o coletor fica saudável, o run
fecha `ACCEPTED`, `n_published` bate, e cada vela gravada sai estreita.

### `D4` — ⛔ O dado JÁ ESCRITO continua contaminado, e nenhuma linha desta ADR o conserta

`D1` para o defeito **prospectivamente**. Toda linha de `klines_ohlc` e `klines_volume` escrita
pela cauda viva **antes** do conserto é prefixo e continua sendo.

⇒ **Continua valendo a proibição de `SPEC-008` §11, agora com escopo preciso:** nenhum backtest
usa `klines_volume` (nem a faixa da vela) como verdade **sobre a janela escrita antes do
conserto**. O dado do **backfill** não está contaminado — ele lê buckets antigos, muito depois do
assentamento, e reproduz a origem ao centavo em `240/240` minutos `[MEDIDO 2026-09-19,
`T-01.5-dod6…`]`.

⚠️ **Limpar ou reescrever o passado NÃO é decidido aqui** — `md.series` é append-only, o custo é
de reprocessamento e de disco (13 GB livres, 95% de ocupação `[MEDIDO 2026-09-19]`), e `D4.13`
faria a linha nova ser ignorada. É trabalho com dono (`quant-architect`) e gatilho (o dia em que
um backtest precisar daquela janela), **não é desta ADR**.

### `D5` — ⚠️ A correção do número `~58 s` que circula em dois documentos

`FASE-01-qa.md:87,117,444` afirma que *"a `fapi` assenta a barra ~58 s depois"* e propõe o
conserto contra esse número. **Ele é uma leitura equivocada do comentário do próprio
`_DEFAULT_KLINES_CYCLE_OFFSET_S`**, que dizia *"leaving ~58 s of margin before a reading could
reach the SECOND grid point"* — `58 s` é a **folga até o próximo ponto da grade**, não o
assentamento. `T-01.7-builder.md:119` repete o erro citando `is_closed_bucket`, cuja `~58 s` é
outra coisa ainda: a **defasagem de volume do bucket EM PROGRESSO**.

**A medição desta ADR põe o assentamento em `≤ 5 s`**, uma ordem de grandeza abaixo. O
diagnóstico do QA estava **certo na direção e errado no número**, e um conserto dimensionado por
`58 s` teria custado 58 s de relógio sem necessidade. **Rotulo isto aqui para que o número
errado não sobreviva em três arquivos** — é a mesma classe do defeito que o `CLAUDE.md` nomeia
(*"uma regra anti-lookahead que estava invertida e propagada por dois documentos"*).

---

## Alternativas recusadas, com custo

| alternativa | por que não |
|---|---|
| **Re-ler a barra num ciclo posterior e escrever a correção** | `ADR-006`/`D4.13`: o acessor pega `argmin(observed_at)`; a correção **nunca seria servida**. Exigiria revogar uma regra anti-lookahead para consertar um defeito de fidelidade — troca ruim |
| **Publicar com `is_final=False` e corrigir depois** | o acessor **recusa** `is_final=False` (`_is_closed_bucket`), e `md.series` é append-only: 34.560 linhas/dia que nenhum caminho de leitura admite, num host cuja premissa é recurso escasso |
| **Ler duas vezes e publicar só quando duas leituras concordarem** | dobra as chamadas para chegar ao **mesmo** resultado que esperar `+10 s` já dá. Cota é barata, mas complexidade que não compra nada é dívida |
| **Mexer em `is_closed_bucket` / `RS-3.4`** | ⛔ é a peça **certa**, com o sinal sob teste. Alargá-la admitiria o bucket em progresso — trocaria um prefixo de 2 s por um prefixo de 58 s |
| **Aumentar o offset para `45 s` ou mais** | não compra fidelidade nenhuma acima de `+10 s` (medido) e gasta relógio de parede. Margem tem de ser a menor que o dado sustenta |

---

## Falsificadores — como o owner confere sem confiar em mim

1. **A escada, reproduzível em uma linha de `curl`.** Pegue um `openTime` de minuto fechado e
   leia a MESMA barra duas vezes, em `+2 s` e em `+30 s`:
   ```bash
   T=$(( ($(date +%s) / 60 - 1) * 60000 ))
   curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=1&startTime=$T"
   ```
   **Morde o modelo de prefixo** qualquer barra com `high` ou `volume` MAIOR na leitura precoce.
   O owner confere contra a Binance, não contra este repositório.

2. **O portão de `D3`.** `_DEFAULT_KLINES_CYCLE_OFFSET_S = 2.0` ⇒ `make test` reprova, nomeando
   `[M-9]`. **Morde** se voltar a `2.0` e a suíte ficar verde.

3. **⛔ O veredito, e ele NÃO está fechado nesta ADR.** `DoD-9` só volta a ser ✅ quando o
   `candle_fidelity_cli` devolver `verdict=accepted`, `rc=0`, sobre uma janela **inteiramente
   coletada depois do deploy do conserto** — e o comando é o da própria fase:
   ```bash
   backend/.venv/bin/python -m src.modules.sentimento.infra.candle_fidelity_cli \
     --symbol BTCUSDT --window-start-ms <T0> --window-end-ms <T0 + 3h> --knowledge-time-ms <now>
   ```
   **Universo obrigatório no laudo:** `T0 >= ` instante do deploy, `n >= 150` buckets por redução,
   em **duas janelas disjuntas** (o mesmo rigor com que o QA o derrubou). **Morde** com qualquer
   `pos=0`/`neg=0` unilateral acima de `minimum_bias_n=4` em `HIGH` ou `LOW`.
   ⚠️ **Uma janela que ATRAVESSE o deploy não serve** — ela mistura as duas populações e diluiria
   o viés até ele caber no ruído.

---

## O que esta ADR NÃO decide — e a fronteira é literal

- **Não conserta o dado já escrito** (`D4`), e não decide reprocessá-lo.
- **Não decide a anomalia de `13,77 px`** do `DoD-2` no pixel. É `web`, outro agente, e as
  magnitudes não batem: o pior desvio de fidelidade medido é **−27,80 USDT** sobre `81.263,40`,
  e a aresta de `13,77 px` vale **≈ 91,2 USDT** pela escala da própria rodada. **Uma não explica
  a outra**, e tratá-las como a mesma causa esconderia as duas.
- **Não altera `deploy/`** — o `KLINES_CYCLE_OFFSET_S` do ambiente continua podendo sobrepor o
  default, e `deploy/compose.yml` documenta `default 2` numa linha de comentário que ficará
  desatualizada até alguém com escopo em `deploy/` a corrigir. **Declarado, não escondido.**
- **⛔ Não decide nada sobre capital, tamanho de posição, corretora ou uso da série para operar.**
  `D4` diz que o dado antigo é prefixo; o que o owner faz com essa informação é decisão dele.

---

## Consequências

- `[M-9]` sai de *"escalado, causa desconhecida"* para *"causa medida na origem, conserto
  aplicado, veredito pendente de re-medição"*. `SPEC-008` §11 emendada.
- A fase `01` **não fecha com esta ADR** — ver `gates/DECISAO-M9-arquiteto.md` §`D2`.
- `klines_volume` (feature `cinco-metricas-do-core`) é consertada **pelo mesmo commit**, sem uma
  linha de código própria: as duas séries saem da mesma resposta HTTP.
- O comentário de `_DEFAULT_KLINES_CYCLE_OFFSET_S` deixa de dizer *"not a measured optimum"*
  sobre a quantidade errada e passa a citar a medição da quantidade certa.
