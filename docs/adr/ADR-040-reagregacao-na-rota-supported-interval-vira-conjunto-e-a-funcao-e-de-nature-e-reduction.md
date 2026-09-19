# ADR-040 — A reagregação mora na rota: `SUPPORTED_INTERVAL` vira conjunto, e a função é de `(nature, reduction)` — não de `nature`

**Data:** 2026-09-19 · **Status:** proposta · **SPEC:** [`SPEC-008`](../specs/SPEC-008-candle-real-e-eixo-unico.md)
**Fases:** `03` (timeframe único), com efeito em toda leitura de `/series-history` · **Componentes alvo:** `sentimento` (caminho de leitura), `web` (a barra de TF)
**Origem:** [`DECISOES-DO-OWNER-2026-09-19.md`](../context/candle-real-e-eixo-unico/handoff/DECISOES-DO-OWNER-2026-09-19.md) `[Q2]`, e o Gap Analysis de `SPEC-008` §1
**Relação com decisões anteriores:** **executa a sucessão que `ADR-034/D6` agendou** — não a contradiz. Compõe com `ADR-037/D3` (`native_grid_ms` declarado na entrada de catálogo), que é o que torna esta decisão barata.

---

## Contexto

O owner pediu uma barra de timeframe — `5m · 15m · 1h · 4h` `[PREMISSA-OWNER: 2026-09-19]` — e
escreveu a premissa de desenho na mesma frase:

> *"é tudo deverivado do 1m, certo? como conversamos de ter somente uma fonta, então o Time line
> escolhido deveria ter impacto "irrelevante", não? Pois o calculo é o mesmo"*

**A primeira metade está certa e é o desenho. A segunda está errada, e errada de um jeito que não
reprova nada:** o cálculo **não** é o mesmo — depende da série. Somar `Open Interest` de 15 minutos
devolve **15× o OI real**: um número plausível, com `rc=0`, que nenhum import quebra e nenhum teste
existente pega.

Hoje a rota recusa o problema em vez de resolvê-lo: `SUPPORTED_INTERVAL = "1m"`
(`series_history.py:48`), com a recusa explícita em `:180-183`
`[MEDIDO 2026-09-19: grep -rn "SUPPORTED_INTERVAL" backend/src --include='*.py']`. Essa recusa foi
**correta** e `ADR-034/D6` a justificou: *"recusar, nunca servir número subestimado"*.

**E `D6` agendou a própria sucessão, nomeando dono e gatilho.** Literal, em `ADR-034/D6:126-131`:

> *"Fica nomeado como trabalho futuro, **dono `quant-architect`**, **gatilho: o dia em que um
> seletor de timeframe entrar no escopo de alguma feature**."*

`[DOC: ADR-034/D6]` — o gatilho disparou em 2026-09-19.

---

## As medições

**M1 — o universo da função é fechado e tem 8 elementos.**
```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog \
  | python3 -c "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) for x in json.load(sys.stdin)['entries']}))"
```
→ `(FLOW,SUM) (RATIO,POINT) (STOCK,CLOSE) (STOCK,HIGH) (STOCK,LAST) (STOCK,LOW) (STOCK,OPEN) (STOCK,POINT)`
`[MEDIDO 2026-09-19, n=60 entradas → 8 pares distintos]`

**M2 — `STOCK` não é uma função, são quatro.** Quatro dos oito pares são `STOCK`, e sob reagregação
`OPEN` é o **primeiro** do bucket, `HIGH` o **máximo**, `LOW` o **mínimo**, `CLOSE`/`LAST`/`POINT` o
**último**. Os quatro já estão vivos hoje sobre `sum_open_interest` da Coinalyze
(`tsConvention=OHLC_OVER_BUCKET`, `n=4` linhas) `[MEDIDO 2026-09-19]`.

**M3 — a vela de `SPEC-008/D1` não acrescenta par novo.** Ela é `(STOCK, OPEN|HIGH|LOW|CLOSE)` — os
mesmos quatro de M2. A tabela nasce com **8 linhas antes e 8 depois** `[MEDIDO 2026-09-19]`.

**M4 — `RATIO` não tem componentes para recompor.**
```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog \
  | python3 -c "import sys,json;print(sorted({x['key']['metric'] for x in json.load(sys.stdin)['entries']}))"
```
→ **7 métricas**, nenhuma de contagem long/short separada `[MEDIDO 2026-09-19, n=60]`.

**M5 — o custo de fio, se a reagregação ficar no browser.** Hoje a página publica
`data-oi-wire-points="5760"` para `data-oi-native-bars="1152"` `[MEDIDO 2026-09-19]`. Com `4h × 500`
velas sobre um fio de 1 min seriam `500 × 4 × 60 = 120.000` pontos **por painel**, em **6** painéis —
**20,8×** os 5.760 de hoje, e **240×** o que a rota entregaria reagregando
`[INFERRED: aritmética sobre `[Q2]`/`[Q3]` e a grade medida]`.

**M7 — o byte/linha do FIO, medido depois de M5 e confirmando-a.**
```bash
curl -s -o /dev/null -w "%{size_download}\n" '.../series-history?…&interval=1m&<janela de 4 dias>'
# 570607  (n_rows=5760)  ⇒  99,06 B/linha
```
`[MEDIDO 2026-09-19, n=1 resposta, sum_open_interest/POINT, BTCUSDT]` ⇒ em `4h` com 500 velas, B2 =
**11,9 MB por série**, **≈ 83 MB por troca de TF** com 7 séries na tela, sobre *VPS compartilhada*
(`[PREMISSA-OWNER: 2026-08-25]`); e só o `setData` de 129.600 pontos × 6 painéis custa **752,6 ms**
de thread principal, antes de qualquer agregação.
⚠️ **É byte de FIO (JSON), não de disco** — não serve para estimar `md.series`.

**M6 — a grade nativa já chega ao caminho de leitura.** `ADR-037/D3` declarou `native_grid_ms` na
entrada de catálogo, em inteiro, *"declarado ao lado do rótulo"* — e o catálogo servido o publica
(`nativeGrid`: `1min`/`5min`) `[MEDIDO 2026-09-19]`. ⇒ a função de reagregação **não precisa parsear
nada** para saber quantos fatos nativos cabem num bucket pedido.

---

## D1 · A reagregação mora **na rota**, e `SUPPORTED_INTERVAL` vira **conjunto**

**Decisão:** `/series-history` passa a aceitar `interval ∈ {1m, 5m, 15m, 1h, 4h}` — os quatro TFs de
`[Q2]` mais a grade nativa — e reagrega no servidor. **Todo `interval` fora do conjunto continua
recusado com `422`.**

⚠️ **A regra de `D6` é mantida palavra por palavra — *"recusar, nunca servir número subestimado"*.**
O que muda não é a disposição de recusar; é que **a função de agregação passou a existir**, então o
conjunto do que pode ser servido sem subestimar cresceu de 1 para 5. Um `interval` de `1d` continua
devolvendo `422`, e pelo mesmo motivo de sempre.

**Por que na rota e não no browser:** `PRD-008/RF-7` exige que a reagregação seja **uma
implementação, num lugar só**. `Nature` é enum de domínio Python (`series_key.py:85-97`), ao lado de
`CARRY_FORWARD_BY_NATURE` (`as_of_accessor.py:112-118`). Pôr a reagregação no browser obriga a
**reescrever a tabela de M1 em TypeScript** — duas implementações da mesma regra, que é exatamente o
que `RF-7` proíbe. M5 acrescenta o custo de transporte: **240×**.

---

## D2 · A função é de **`(nature, reduction)`**, e é **pura** — nunca uma tabela por métrica

**Decisão:** a agregação é uma função total sobre o par `(nature, reduction)` **lido do `SeriesKey`
servido**, com os 8 pares de M1 como domínio. Nunca uma tabela indexada por `metric`, nunca um
`if` por nome de série.

**O que isto compra:** métrica nova que não acrescente par novo **herda a função sem tocar em
código**; métrica que acrescente par novo **falha alto** em vez de cair num padrão. Uma tabela por
métrica tem a propriedade oposta: a métrica nova que ninguém lembrou de cadastrar recebe silêncio.

⛔ **`STOCK` sozinho é insuficiente, e este é o achado que a ADR existe para registrar.** O
documento de decisões do owner escreve *"`STOCK` = último/OHLC"*; M2 mede que são **quatro funções
diferentes**. Tomar "o último" para `reduction=OPEN` devolve o fechamento vestido de abertura — uma
vela de corpo invertido que não quebra import, não reprova teste, e parece plausível. É a mesma
classe do `rc=0` ambíguo de `ADR-012`.

**O conteúdo exato das 8 linhas é de `quant-architect`**, dono nomeado por `D6` (`SPEC-008` §5). Esta
ADR fixa a **forma** da função e o **domínio** dela; não preenche as células.

---

## D3 · A cobertura parcial de bucket **fechado** é peça própria, e ela está EM ABERTO

`D6` nomeou esta peça e disse que *"nenhum documento desta feature especificou"* — e continua sem
especificação. É distinta do bucket **em progresso**, que já tem cura (`is_closed_bucket`, cuja
inversão de sinal tem teste próprio `[DOC: collector_series_mapping.py:411-431]`).

O caso: bucket de `4h` **fechado**, com 180 de 240 fatos de 1 min presentes. Somar `FLOW` ali
**subestima em silêncio**.

**Decisão desta ADR:** a rota **não pode servir um bucket reagregado sem declarar a cobertura que o
compõe**.

### ✅ A regra — RESPONDIDA em 2026-09-19 pelo `quant-architect`, e ela DERRUBA "recusar"

Esta ADR nasceu deixando a escolha (recusar / marcar / limiar) para o dono nomeado. Ele respondeu
**`P-B` — servir SEMPRE, com o par de inteiros, sem limiar** — e matou as outras duas com número,
o que é mais forte que a minha redação original:

1. a completude **piora com o TF**: `klines_volume` **93,0%** (`5m`) → 90,7% → 84,7% → **78,3%**
   (`4h`) `[MEDIDO 2026-09-19, n=4.604/1.532/380/92 buckets fechados]` ⇒ *"recusar se < 100%"*
   apagaria **21,7%** das barras de `4h`;
2. 1 minuto faltando é **80%** em `5m` e **99,6%** em `4h` ⇒ **percentual não é unidade
   transportável**, e um limiar em porcentagem significa coisas diferentes por TF;
3. ⛔ `sum_liquidation` tem **0,0% de buckets completos em TODO TF** (301 valores / 5.460
   `SEM_PONTO`, `n=5.761`) ⇒ **qualquer limiar apaga o painel inteiro**.

⇒ a rota serve **sempre**, acompanhada de `{"present": 81, "expected": 240}` — **par de inteiros,
nunca bool, nunca percentual** — e **nunca extrapola**. O default é por **regime de erro**: regime
**A** (`Σ`/`max`/`min`, viés unilateral sem cota) serve parcial **com marca visível**; regime **B**
(`first`/`last`, erro limitado por frescor) usa `maxStalenessMs`, que já existe (`ADR-006`).

**A magnitude do que estava invisível:** bucket fechado de 2026-09-16 00:00, 81/240,
`Σ = 4.246,891 BTC` — **subestima ~66,2%**, e a tela não diz nada hoje `[MEDIDO 2026-09-19]`.

⚠️ **E a cobertura declarada NÃO promete soma certa:** `klines_volume` armazenado subestima a
origem mesmo em buckets de cobertura alta (−2,2% a −4,5%, `pos=0` em 4/4, `n=960`) — ver
`SPEC-008`/`[M-9]`. `P-B` mede a **presença**, não a **fidelidade**; confundir as duas seria
comprar de volta o `rc=0` ambíguo por outro caminho.

---

## D4 · `(RATIO, POINT)`: *"recomputa dos componentes"* é recusado por **impossibilidade medida**

M4 mede que as séries-componente não existem. Escrever um critério de aceite exigindo recomposição
produziria um teste que **nenhuma implementação correta passa** — falso vermelho permanente, tão
corrosivo quanto o falso verde, e pior de diagnosticar porque parece rigor.

**Decisão:** enquanto não houver série-componente, `(RATIO, POINT)` **não recompõe**. `RATIO` **nunca
soma** e **nunca faz média ingênua** — as duas são erro de tipo sobre um quociente adimensional, e
`ADR-036/D3` já recusou o `ls_ratio` genérico pelo mesmo motivo.

### ✅ E o `quant-architect` foi ALÉM: ingerir os componentes **também não resolveria**

Ele mediu o fio em vez de supor: `longAccount`/`shortAccount` são **frações que somam 1**, não
contagens ⇒ somá-las dá `média/média`, **outro estimador**, não o certo. A conclusão é mais forte
que a desta ADR como escrita: **para razão de estoque não existe "agregado sobre o bucket"**, só
*"qual instante você reporta"*.

⇒ resta **`last`**, rotulado *"razão no fechamento do bucket"*, habilitado por **allowlist de
`metric` com 1 elemento** (`count_long_short_ratio`) — ⛔ **e não por `nature`**, porque `SeriesKey`
tem **um** membro `RATIO` para **dois** comportamentos (`as_of_accessor.py:99-110`): razão de
**fluxo** somada infla **3,3×** (p50 `3,1809` contra `0,9707`) `[MEDIDO 2026-09-19]`.

**Nomeada e não construída:** `R4`, OHLC da própria razão (16 entradas, **zero cota**) —
`SPEC-008`/`[M-11]`.

---

## Alternativas recusadas — com o custo de cada uma

| # | alternativa | custo medido | por que recusada |
|---|---|---|---|
| **B2** | Reagregar no **browser**; o fio continua `1m` | **120.000** pontos por painel × 6 painéis a `4h × 500`, contra 500 — **240×** (M5) | viola `RF-7`: a tabela de M1 teria de ser reescrita em TS. Duas implementações da mesma regra é o modo de falha que `RF-7` existe para proibir |
| **B3** | Híbrido: grade nativa servida, rota reagrega sob demanda | mais superfície de contrato, sem remover a de B2 | não resolve `RF-7` — a reagregação continuaria **podendo** acontecer dos dois lados, que é a condição de as duas divergirem |
| **B4** | Manter `"1m"` e recusar a barra de TF | zero custo de código | recusa um requisito que o owner declarou, e a recusa não é mais honesta: a função de agregação agora é construível, então `422` deixaria de significar *"não sabemos fazer sem mentir"* e passaria a significar *"não quisemos"* |
| **B5** | Função indexada por `metric` em vez de `(nature, reduction)` | 7 linhas hoje em vez de 8 | métrica nova cai em silêncio no padrão em vez de falhar alto (`D2`) |

---

## Falsificador

**Três observações, cada uma derruba uma parte desta ADR:**

1. ⛔ **Contra `D2` — o falsificador principal, e ele tem de MORDER trocando uma função por outra.**
   **Um teste que passe trocando `first` por `last` na implementação de `OPEN` não é falsificador;
   é decoração.**

   ⚠️ **E o `CA-8` do `PRD-008` é exatamente essa decoração: medido, ele morde `1` de `20` trocas
   e passa VERDE sobre a vela degenerada** que `RN-2` mede existir `[MEDIDO 2026-09-19,
   quant-architect]`. Substituído por **`CA-8′`**, em 4 camadas: guarda de não-degenerescência
   primeiro; **fixture colhida da Binance, não do nosso banco** (BTCUSDT, bucket fechado
   2026-09-18 12:00→16:00 UTC, 240/240 — `first(open)` **78.031,00** · `max(high)` **81.156,80**
   (`max(close)` daria 81.062,60, **−11,7 bp**) · `min(low)` **77.923,50** · `last(close)`
   **80.688,70** (`first(close)` daria 77.984,40, **−3,35%**), idênticos à vela `4h` da própria
   Binance e portanto **auto-verificáveis pelo owner no gráfico**); **matriz exaustiva 8 pares × 5
   funções = 20 asserções**; e ablação de cobertura (81/240) exigindo que **`mean × 240` não
   apareça**.

2. **Contra `D1`** — se `/series-history?interval=15m` devolver `200` com um `FLOW` que **não** seja a
   soma dos fatos de 1 min contidos no bucket, ou um `STOCK` que seja soma em vez do extremo/último
   correspondente, `D1` foi violada por implementação que ignorou `D2`. (É o falsificador de
   `ADR-034/D6` estendido do `1m` para o conjunto inteiro.)

3. **Contra `D1` na direção oposta** — se algum `interval` **fora** de `{1m,5m,15m,1h,4h}` devolver
   `200`, a recusa de `D6` foi diluída em vez de estendida, e `D1` está errada como escrita.

**E o falsificador desta ADR como um todo:** se, passada a fase `03`, a tabela de M1 tiver crescido
por **acréscimo de linha por métrica** em vez de por acréscimo de par `(nature, reduction)`, `D2`
não pegou — a função virou a tabela por métrica que `B5` descreve, com outro nome.

---

## Consequências

- `ADR-034/D6` **não é reescrita nem revogada**: ela previu este dia, nomeou o dono e o gatilho.
  Esta ADR é a execução daquele agendamento, e a cláusula *"recusar, nunca servir número
  subestimado"* continua de pé — sobre um conjunto de 5 em vez de 1.
- `ADR-037/D3` fica sendo **pré-requisito cumprido**: `native_grid_ms` declarado em inteiro (M6) é o
  que permite à função saber quantos fatos nativos um bucket pedido deveria conter — e portanto é
  o que torna `D3` (cobertura parcial) **mensurável** em vez de opinativa.
- `SPEC-008` fases `02` e `03` **não entram em plano** antes de `[M-3]` (`quant-architect`) e
  `[M-4]` (`frontend-architect`).
- A barra de TF de `web` passa a ter um conjunto **servido pelo backend**, não escrito à mão no
  front — senão o front oferece um TF que a rota recusa, e o `422` vira defeito de tela.
