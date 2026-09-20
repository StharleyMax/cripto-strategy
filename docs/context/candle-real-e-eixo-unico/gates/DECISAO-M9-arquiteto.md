# Decisão do arquiteto quantitativo sobre `[M-9]` na vela — `D1`, `D2`, `D3`

> **Autonomia declarada.** `[DECISÃO-OWNER: 2026-09-20]`, literal: *"o arquiteto tem autonomia
> para decidir caminho nessas questões. N é um fato que precisa vim ao owner"*. ⇒ as três
> decisões abaixo estão **tomadas e executadas**, não propostas.
>
> Pauta: [`handoff/DECISAO-ARQUITETO-M9.md`](../handoff/DECISAO-ARQUITETO-M9.md).
> Ramo `wave/candle-f01`, base `b9bd200`.

---

## `D1` — A causa-raiz: **a origem ainda não terminou de agregar a barra que já declarou fechada**

**Decisão em uma linha:** o coletor lê a kline em `bucket_end + 2 s`, recebe um **PREFIXO** dos
negócios do bucket, e grava `is_final=True` — para sempre. **O conserto é o offset do poll.**

**ADR:** [`ADR-041`](../../../adr/ADR-041-a-cauda-viva-le-uma-barra-que-a-origem-ainda-nao-assentou-a-causa-raiz-de-m9.md)
(muda o contrato de cadência do coletor ⇒ ADR, como a pauta exigiu).

### Como eu medi — e o banco ficou FORA do laço

Toda medição anterior comparou **o que armazenamos** contra **o que a Binance diz hoje**, o que
confunde *"gravamos errado"* com *"lemos cedo"*. As duas abaixo leem `/fapi/v1/klines` contra
`/fapi/v1/klines`, **a mesma barra**, em instantes diferentes.

**M1 — a escada de assentamento.** Mesma barra fechada, lida em `+2/+5/+10/+30 s`, cada rung
comparado contra uma referência em `+110 s`, campo a campo:

```
  rung    n    OPEN  HIGH  LOW  CLOSE  VOLUME     barras que DIFEREM da referencia
  + 2.0s  52     0     3    2     21      32        <= O QUE A PRODUCAO GRAVA HOJE
  + 5.0s  52     0     0    0      2       3        <= AINDA NAO LIMPO
  +10.0s  52     0     0    0      0       0        <= menor degrau LIMPO
  +30.0s  52     0     0    0      0       0
```

```bash
python3 scratchpad/ladder.py 13 ladder_out.json && python3 scratchpad/an_ladder.py ladder_out.json
```
`[MEDIDO 2026-09-20T23:06–23:3xZ, n=52 barras = 4 símbolos × 13 buckets de 1 min]`

**M2 — os cinco sinais, no par `+2 s` contra `+45 s`.** Sinal de `leitura_+2s − leitura_assentada`:

```
  OPEN    pos= 0  neg= 0  zero=88     <= EXATO em 88/88 barras
  HIGH    pos= 0  neg= 6             <= so para BAIXO
  LOW     pos= 3  neg= 0             <= so para CIMA
  CLOSE   pos=13  neg=15             <= ATRAVESSA O ZERO
  VOLUME  pos= 0  neg=48             <= so para BAIXO
```
`[MEDIDO 2026-09-20T23:04–23:2xZ, n=88 barras = 4 símbolos × 22 buckets]`

⭐ **São os MESMOS cinco sinais que `[M-9]` e o `DoD-9` mediram no dado armazenado, reproduzidos
sem nunca tocar em `md.series`.**

### Por que isto é explicação e não coincidência

Um **prefixo não-vazio `P`** de uma sequência de negócios `S` satisfaz, por aritmética:
`open(P)=open(S)` · `high(P)<=high(S)` · `low(P)>=low(S)` · `vol(P)<=vol(S)` · `close(P)` **sem
relação de sinal**. São exatamente os cinco sinais, **preditos a priori**. E é falsificável por
**uma** barra: `high(+2s) > high(+110s)` ou `volume(+2s) > volume(+110s)` derruba o modelo.
**Zero ocorrências em `n = 52`.**

⭐ **E a direção foi predita ANTES de ser contada**, então a probabilidade é unilateral: sob sinal
simétrico independente, `VOLUME` 48/48 no sentido predito dá `P = 2⁻⁴⁸ ≈ 3,6·10⁻¹⁵`; `HIGH` 6/6 e
`LOW` 3/3 somam `2⁻⁹`. **`CLOSE` é o controle interno** — o único campo que o modelo não orienta,
e o único que atravessa o zero (`13`/`15`). Um viés do meu instrumento apareceria nele também.

### O conserto, e o que ele NÃO toca

| | |
|---|---|
| **muda** | `_DEFAULT_KLINES_CYCLE_OFFSET_S`: `2.0` → **`20.0`** s (`collectors_cli.py`) — **o dobro do menor degrau LIMPO** (`+10 s`); o fator 2 é **margem declarada como margem**, não medição |
| **portão novo** | `test_the_klines_poll_fires_after_the_origin_has_settled_the_bar_never_before` — reprova abaixo de `KLINES_SETTLEMENT_BOUND_S = 10.0`, **com a razão na mensagem** |
| **⛔ NÃO toca** | `is_closed_bucket`/`RS-3.4` — o corte anti-lookahead está **certo** e o sinal dele está sob teste. O bucket **fechou**; quem não terminou é a agregação da origem |
| **⛔ NÃO toca** | `build_klines_to_rows` — o backfill usa o mesmo código e reproduz a origem ao centavo |
| **custo servido** | **zero fatia.** `_read_instant` pede `as_of` com `t = grid + 60.000 − 1` (`series_history.py:154`) ⇒ `R-1` admite a barra na MESMA fatia para qualquer offset < 60 s. O que muda é relógio de parede: a linha chega a `md.series` **18 s** depois |
| **cota** | **zero chamada nova** — é a fase do mesmo ciclo de 60 s. `RNF-4` intacto |

### ⛔ Como eu quase errei o número, registrado porque é o modo de errar

Nas primeiras **`n=12`** barras da escada, o degrau `+5 s` estava limpo em **todos** os campos, e
eu cheguei a escrever `offset = 10,0` contra esse número. Deixar a escada correr até `n=52`
destapou as barras que **ainda se moviam em `+5 s`**. Um bound tirado da primeira amostra que
pareceu limpa teria entrado no repositório **rotulado como `[MEDIDO]`**, e a amostra maior o
refuta. **É o mesmo modo de falha que este laudo acusa no `~58 s` do QA** — número plausível,
fonte real, quantidade errada.

### ⚠️ Correção de um número que circulava em três arquivos

`FASE-01-qa.md:87,117,444` diz *"a `fapi` assenta a barra ~58 s depois"* e dimensiona o conserto
por esse número; `T-01.7-builder.md:119` repete. **`58 s` é leitura equivocada** do comentário do
próprio `_DEFAULT_KLINES_CYCLE_OFFSET_S` (*"leaving ~58 s of margin before a reading could reach
the SECOND grid point"*) — é folga até o próximo ponto da grade, não assentamento. O assentamento
medido é **uma ordem de grandeza menor**. O diagnóstico do QA estava **certo na direção e errado
no número**.

---

## `D2` — A fase `01` **NÃO fecha**, e a alternativa escolhida é *consertar antes de fechar*

**Escolhida:** *consertar antes de fechar*. **As três, com o custo que a pauta pediu declarado:**

| alternativa | custo, medido ou derivado | veredito |
|---|---|---|
| **consertar antes de fechar** | o medo declarado era *"a causa-raiz é de outra ADR e pode arrastar"*. ⇒ **falsificado**: o conserto é **1 constante + 1 teste + 1 ADR**, e está neste commit | ✅ **escolhida** |
| fechar com `DoD-9` diferido | destrava a fase `02`, mas a fase `02` é o **eixo único**, e um eixo é escalado pelos **extremos**. Empilhar o eixo sobre `HIGH` subestimado e `LOW` superestimado propaga o defeito para a geometria de **seis painéis** | ⛔ recusada |
| fechar com escopo reduzido (*"vela COM FORMA, não FIEL"*) | renomeia a entrega para caber no que foi construído. O uso declarado do owner é leitura **SMC**, e pavio é **onde a liquidez foi varrida**: uma vela cuja faixa é sistematicamente estreita entrega **zero** uso admissível. Escopo reduzido aqui é entregar nada com nome bonito | ⛔ recusada |

### ⛔ E ela não fecha HOJE mesmo com o conserto aplicado — isto é o custo honesto da escolha

1. **`DoD-9` não é re-mensurável agora.** O veredito precisa de uma janela **inteiramente
   coletada depois do deploy** do conserto, e `deploy/` **não é meu escopo**. Uma janela que
   ATRAVESSE o deploy mistura as duas populações e diluiria o viés até ele caber no ruído.
2. **`DoD-2` no pixel está aberto por outra causa** (`13,77 px`, `web`, outro agente) — e as
   magnitudes **não batem**: o pior desvio de fidelidade é **−27,80 USDT** sobre `81.263,40`,
   e a aresta de `13,77 px` vale **≈ 91,2 USDT** pela escala da própria rodada. **Uma não explica
   a outra.**

### O comando que fecha `DoD-9`, com o universo obrigatório

```bash
backend/.venv/bin/python -m src.modules.sentimento.infra.candle_fidelity_cli \
  --symbol BTCUSDT --window-start-ms <T0> --window-end-ms <T0+3h> --knowledge-time-ms <now>
```
- `T0 >=` instante do deploy do conserto; **`n >= 150` buckets por redução**; **duas janelas
  disjuntas** (o mesmo rigor com que o QA o derrubou);
- ✅ só com `verdict=accepted`, `rc=0`, e **nenhum** viés unilateral acima de `minimum_bias_n=4`
  em `HIGH` ou `LOW`.

### As três ações que o QA pediu no `DoD-9`, respondidas

| pedido do QA | onde |
|---|---|
| `DoD-9` deixa de ser ✅ | este laudo + `SPEC-008` §11 emendada (`[M-9]` deixa de ser "causa desconhecida") |
| escalar a `/architect` como achado novo | `ADR-041` **é** o pouso da escalada, com causa medida |
| *"um falsificador que repita isto sozinho"* | `test_the_klines_poll_fires_after_the_origin_has_settled_the_bar_never_before`, em `make verify`, offline. **Nada mais na suíte pegaria a volta do `2.0`**: o coletor fica saudável, o run fecha `ACCEPTED`, `n_published` bate, e cada vela sai estreita |

### ⛔ O dado já escrito continua contaminado

`D1` para o defeito **prospectivamente**. Toda linha de `klines_ohlc`/`klines_volume` escrita
pela cauda viva **antes** do conserto é prefixo. ⇒ **nenhum backtest usa `klines_volume` nem a
faixa da vela como verdade sobre essa janela.** O **backfill** não está contaminado (lê buckets
antigos, muito depois do assentamento; `240/240` minutos ao centavo).

---

## `D3` — O achado do LOOKAHEAD ganha carregador: `ADR-042` + `T-05.0` + emendas

**O fato:** o backfill de 90 dias (**2.148.504 linhas**, **1,641 GB**, run `ACCEPTED`) é
**invisível para a rota**. `psql` devolve 240 linhas na janela auto-verificável e
`/series-history` devolve `absence: {SEM_PONTO: 241}` nas 241 fatias
`[MEDIDO 2026-09-19, T-01.5-dod6-medicao-e-achado-lookahead.md]`. **E não é bug:** `R-1` é
`available_at <= t` com `t` = **a fatia**; a linha tem `available_at − bucket_end ≈ 33 h`, e
servi-la naquela fatia **seria lookahead**.

**Antes desta decisão, o achado tinha `0` linha em três arquivos** `[MEDIDO 2026-09-20, n=3]`:

```bash
grep -rniE "modos? de leitura|knowledge_time|available_at|anti-lookahead" \
  docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md \
  docs/specs/SPEC-008-candle-real-e-eixo-unico.md \
  docs/context/candle-real-e-eixo-unico/tasks.toml
```

⇒ **a fase `05` estava planejada sobre uma premissa que o achado falsifica**: o `DoD 1` dela
(*"3 arrastos aumentam a contagem de barras"*) morderia por **falta de dado servido**, não por
defeito de paginação.

**Decisão:** [`ADR-042`](../../../adr/ADR-042-dois-relogios-available-at-responde-ao-horizonte-de-conhecimento-nao-a-fatia.md)
— `bucket_end` responde à **fatia** (*valid time*); `available_at` responde ao **horizonte de
conhecimento `K`** (*transaction time*). **Com `K = t`, o modo de decisão é idêntico ao de hoje,
byte a byte** — a regra antiga é caso particular da nova. `K > t` é admitido **somente** sob
`ReadPurpose.RENDERING`; `ENTRY_CONDITION` e `EXECUTION_SIMULATION` **levantam**.

**Onde ele entrou, em máquina e em prosa:**

| arquivo | o que ganhou |
|---|---|
| `docs/adr/ADR-042-…md` | a decisão, com `D1..D5`, o custo declarado e 4 falsificadores |
| `docs/context/candle-real-e-eixo-unico/tasks.toml` | **`T-05.0`** (nova), com `DoD-a..DoD-e`; `T-05.1` e `T-05.8` passam a **depender** dela |
| `docs/plans/…/05_historia_sob_demanda.md` | pré-requisito no topo + `DoD 0` (o portão de `D3`) + a ressalva no `DoD 1` |
| `docs/specs/SPEC-008-…md` | §7.0 (emenda a `D5`) + `[M-12]` na tabela §11 |

⚠️ **O que isto NÃO autoriza:** afrouxar `R-1`. Contagem de barras subindo **sem** o portão de
`ADR-042`/`D3` é o lookahead voltando pela porta que a fase `05` abriu. Por isso `DoD-a` (recusa)
e `DoD-b` (o caso positivo) vivem **no mesmo arquivo de teste**: sozinho, `DoD-a` não distingue
*"recusou certo"* de *"recusa tudo"*.

⚠️ **`SPEC-001` §2.3 carrega a fórmula literal de `R-1` e precisa de emenda quando `ADR-042` sair
de `proposta`.** Não a emendei: duas verdades sobre `R-1` em dois documentos é o defeito que este
repositório já pagou uma vez, e a emenda pertence ao ciclo que executar `T-05.0`.

---

## ⛔ O que eu NÃO julgo — declarado, porque é obrigação do meu perfil

1. **Se vale a pena reprocessar ou limpar a janela contaminada.** É custo de disco (**12,8 GB
   livres, 95%** `[MEDIDO 2026-09-19]`) e de reprocessamento, contra o valor de uma janela de
   backtest que ainda não existe. **Decisão do owner**; eu só declarei que a janela é prefixo.
2. **A anomalia de `13,77 px`.** É `frontend/`, fora do meu escopo, e está com outro agente. Eu
   mostrei que **não é o mesmo defeito** (as magnitudes não batem); **não sei** o que é.
3. **Quando o deploy do conserto acontece.** `deploy/` não é meu escopo. ⚠️ E
   `deploy/compose.yml:168` documenta `default 2` num comentário que **fica desatualizado** até
   alguém com escopo lá corrigir — **declarado, não escondido**.
4. **Se o `K` padrão do gráfico deve ser `server_now_ms` ou escolhido pelo operador** além do
   modo história. É desenho da fase que pedir replay.
5. **⛔ Nada sobre capital, tamanho de posição, gestão de risco, corretora ou jurisdição.** Em
   particular: um gráfico com `K = now` mostra história **revisada**, e ler uma estratégia nele
   **não é** um backtest. A separação técnica é `ADR-042`/`D3`; o que o owner faz com a tela é
   decisão dele.
6. **⚠️ `docs/adr/README.md` já estava desatualizado ANTES de mim, e eu não o reconciliei.** Ele
   afirma **26** ADRs e o próprio falsificador dele diz para conferir: `ls docs/adr/ADR-*.md |
   wc -l` devolve **42** `[MEDIDO 2026-09-20]` — a divergência existe desde `ADR-027` e não é
   desta decisão. Reconciliar 16 ADRs alheias seria escopo que ninguém me deu. **Declarado, não
   escondido.**
7. **`[NÃO MEDIDO]`** — a Binance **não documenta** janela de assentamento para
   `/fapi/v1/klines`. O bound é empírico sobre `n = 52` barras de **um** intervalo de ~26
   minutos, em 4 símbolos, num momento de mercado só. **Um regime mais volátil pode assentar mais
   devagar**, e por isso o fator de margem está declarado como margem, não como medição.

---

## Reprodução — os scripts e a saída bruta

Fora do repositório por convenção (`data/` e scratchpad não são versionados). Caminho da sessão:
`/tmp/claude-1002/-home-stharley-Documentos-projects-cripto-strategy/48f7d5ac-…/scratchpad/`
— `ladder.py`, `an_ladder.py`, `probe.py`, `an_probe.py`, `ladder_out.json`, `probe_out.json`.

**O falsificador mais barato, que não depende de nenhum deles** — leia a MESMA barra duas vezes:

```bash
T=$(( ($(date +%s) / 60 - 1) * 60000 ))
curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=1&startTime=$T"
sleep 30
curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=1&startTime=$T"
```
Se os dois arrays forem **iguais**, o modelo de prefixo não se aplica àquela barra. Se
diferirem — e eles diferem — a primeira leitura é o que a produção gravava como final.
