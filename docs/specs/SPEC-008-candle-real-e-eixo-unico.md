# SPEC-008 — Candle real e eixo único: quatro leituras de uma chamada já paga, e um eixo com um dono só

**Status:** `DRAFT` — **e isto não é formalidade.** `SPEC_APPROVED` é gate do **owner**
(`CLAUDE.md`, *"Gates marcados owner não podem ser feitos por agente"*). Nenhum agente marca esta
SPEC como aprovada, nem no texto, nem no ledger.
**Feature:** `candle-real-e-eixo-unico` · **filha de** `plataforma-dados`
**Componente primário:** `web` · **toca:** `sentimento` (ingestão), `charts` (composição)
**PRD:** [`PRD-008`](PRD-008-candle-real-e-eixo-unico.md) · **veredito do Gap Analysis:** `[READY FOR SPEC]`
**Estado do ledger ao escrever:** `PRD_VALIDATED`
`[MEDIDO 2026-09-19: harness pipeline show candle-real-e-eixo-unico, n=7 eventos]`

**Entradas de primeira classe:**
[`DECISOES-DO-OWNER-2026-09-19.md`](../context/candle-real-e-eixo-unico/handoff/DECISOES-DO-OWNER-2026-09-19.md) ·
[`DISCOVERY.md`](../context/candle-real-e-eixo-unico/handoff/DISCOVERY.md) ·
[`handoff_to_architect.md`](../context/candle-real-e-eixo-unico/handoff_to_architect.md)

---

## 0. Como ler

Zero código. Esta SPEC fixa **contratos, formas de dado, limites de camada e comportamento de
borda** — não implementação.

Toda afirmação quantitativa carrega **o comando, o universo (`n`) e o rótulo de força**
(`CLAUDE.md`). As medições de §1 foram **re-rodadas por este `/architect`** contra a stack de pé,
não copiadas do `PRD-008`. Onde a re-medição **corrigiu** o PRD, está dito na linha — a correção é
o achado.

⚠️ **Uma medição foi NEGADA e está declarada como tal, não estimada em silêncio:** a leitura de
`pg_total_relation_size('md.series')` no Postgres de produção foi recusada pela política do
ambiente. Toda pegada de disco desta SPEC é portanto **aritmética sobre contagem de linhas**, com
rótulo `[INFERRED]`, e o byte/linha real é **`[NÃO MEDIDO]`** — vira DoD da fase `01`, não premissa.

> ✅ **RESOLVIDO em 2026-09-19 por `T-01.5`, e o número derrubou a estimativa: 496 B/linha**
> `[MEDIDO, n=19.106 linhas: (1290756096−1281286144)/(2688019−2668913)]`. A estimativa que circulava
> era 99 B — **5× otimista**; ~45% do custo é ÍNDICE, que a aritmética sobre contagem de linhas não
> enxergava. Projeção do teto de 90 dias com as 4 chaves: **1,03 GB** (2.073.600 linhas).
> ⚠️ E a medição só foi possível trocando o comando: `pg_total_relation_size` é **cego em
> hypertable** — ver a correção de instrumento em §3.6. A recusa de ambiente citada acima **não era
> a única barreira**; o comando também não media.

---

## 1. O veredito do Gap Analysis, e os quatro achados que ele produziu

**Veredito: `[READY FOR SPEC]`.** Os quatro bloqueantes que o `PRD-008` levou ao owner
(`[Q1]`..`[Q4]`) voltaram respondidos em 2026-09-19. Nenhum gap novo bloqueia; os quatro achados
abaixo são **resolvidos nesta SPEC**, e três deles corrigem um documento anterior.

### A-1 ⭐ A função de reagregação é de `(nature, reduction)`, **não** de `nature`

O documento de decisões do owner escreve a tabela como *"`STOCK` = último/OHLC"*. **Essa célula
colapsa quatro funções diferentes numa palavra**, e o colapso é exatamente a classe de defeito que
ela mesma nomeia (*"devolve um número plausível e errado"*).

Sob reagregação, `OPEN` é o **primeiro** do bucket, `HIGH` é o **máximo**, `LOW` é o **mínimo**,
`CLOSE`/`LAST`/`POINT` são o **último**. Tomar "o último" para `reduction=OPEN` devolve o
fechamento vestido de abertura: uma vela com corpo invertido que **não quebra import, não reprova
teste e parece plausível**.

O universo é **fechado e pequeno — `n=8` pares vivos hoje**:

```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog \
  | python3 -c "import sys,json;print(sorted({(x['key']['nature'],x['key']['reduction']) for x in json.load(sys.stdin)['entries']}))"
```
→ `(FLOW,SUM) (RATIO,POINT) (STOCK,CLOSE) (STOCK,HIGH) (STOCK,LAST) (STOCK,LOW) (STOCK,OPEN) (STOCK,POINT)`
`[MEDIDO 2026-09-19, n=60 entradas de catálogo → 8 pares distintos]`

⇒ **A vela de `D1` não acrescenta nenhum par novo:** `(STOCK, OPEN|HIGH|LOW|CLOSE)` **já estão
vivos**, servidos hoje pelo `sum_open_interest` da Coinalyze (`tsConvention=OHLC_OVER_BUCKET`).
A tabela de reagregação nasce com **8 linhas antes e 8 linhas depois** de F1.

### A-2 ⭐ `ADR-034/D6` **agendou a própria sucessão**, e o gatilho disparou hoje

O `PRD-008` (§14-B) e o handoff dizem que B1 *"reabre `ADR-034/D6`"*, e que *"a reabertura é ato
daquela ADR"*. **Está certo — e a ADR já escreveu como.** Literal, em
`docs/adr/ADR-034-…md:126-131`:

> *"Fica nomeado como trabalho futuro, **dono `quant-architect`**, **gatilho: o dia em que um
> seletor de timeframe entrar no escopo de alguma feature**."*

`[DOC: ADR-034/D6]`. Esse dia é **hoje** — `[Q2]` do owner colocou `5m·15m·1h·4h` numa barra.

⇒ B1 **não contradiz** `D6`: executa a sucessão que `D6` previu. E o **dono nomeado não é o
`/architect`** — é o `quant-architect`. Por isso §5 desta SPEC é **delegada**, não decidida aqui.

### A-3 ⭐ `D6` nomeou uma peça que **nenhum documento desta feature especificou**: cobertura parcial

Ainda literal em `D6`: a alternativa recusada o foi por *"introduzir uma peça de domínio nova
(**política de cobertura parcial: 5 de 5 minutos presentes vs. 3 de 5**) que nenhum documento desta
feature especificou"*.

Continua sem especificação. E ela é **estrutural sob TF longo**: um bucket de `4h` **fechado** com
180 dos 240 fatos de 1 min presentes, somado como `FLOW`, **subestima em silêncio**. O
`PRD-008` §16 nomeia o *bucket em progresso* — que é outro problema, e já tem cura
(`is_closed_bucket`). **Cobertura parcial de bucket fechado é problema diferente e está aberto.**

⇒ `RN-3`/`CA-8` do PRD são **necessários e insuficientes**. §5 fecha isto, pelo dono de `A-2`.

### A-4 ⭐ `(RATIO, POINT)` não tem componentes — *"recomputa dos componentes"* é **impossível hoje**

O documento do owner oferece, para `RATIO`, *"recomputa dos componentes, ou toma o último"*.
Medi o catálogo inteiro: existem **7 métricas distintas**, e **nenhuma** é contagem de contas long
ou short em separado.

```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog \
  | python3 -c "import sys,json;print(sorted({x['key']['metric'] for x in json.load(sys.stdin)['entries']}))"
```
→ `count_long_short_ratio · cvd_source · klines_last · klines_volume · price_mark_close · sum_liquidation · sum_open_interest`
`[MEDIDO 2026-09-19, n=60 entradas → 7 métricas]`

⇒ o primeiro ramo da disjunção **não é implementável sem série nova**. Escrever `CA-8` exigindo
recomputação criaria um critério que **nenhuma implementação correta consegue passar** — falso
vermelho permanente, que é tão corrosivo quanto o falso verde.

### A-5 Achado lateral de governança — `components` diverge do `CLAUDE.md`

```bash
harness policy --key components
```
→ `["sentimento","charts","convergencia","backtest","web","docs","infra"]` — **7**
`[MEDIDO 2026-09-19]`, contra as **6** que o `CLAUDE.md` enumera (*"Vocabulário fechado de
componentes"*). `infra` existe na política e não no documento.

⚠️ Não é desta feature consertar (alterar o vocabulário é **ato do owner**), e não bloqueia: os
três componentes que esta SPEC usa (`sentimento`, `web`, `charts`) são válidos nos dois. Ficou
registrado como **`[M-1]` para o owner**, porque o `CLAUDE.md` é a fonte que os agentes leem
primeiro, e ali ele estava desatualizado.

> ✅ **RESOLVIDA em 2026-09-19: a política é a verdade — `components` são 7, com `infra`.** O
> `CLAUDE.md` foi emendado em duas superfícies (seção do vocabulário e linha 9 da tabela de
> fronteira); `harness.toml` **intocado**, porque era o documento que divergia, não a política.
> ⚠️ O falsificador de idioma **não** ganhou `infra` na exclusão, e isso é deliberado — §11.1.

---

## 1-bis. Os quatro achados que os JULGAMENTOS DELEGADOS trouxeram, e três mudam o desenho

Os dois julgamentos voltaram em 2026-09-19 (§5, §6). Eles **não** ratificaram o briefing: trouxeram
quatro achados que o `/architect` não tinha, e o registro honesto é dizer que **três deles
corrigem esta própria SPEC**.

### A-6 ⭐ Os painéis **já não compartilham grade hoje** — ligar a assinatura sem unificar é PIOR

```bash
grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <captura de /symbol> | sort -u
# price_slots:5760 · cvd_slots:5760 · long_short_slots:5760 · oi_slots:1152
```
`[MEDIDO 2026-09-19, n=4 painéis que publicam `slots`]`

A causa está no código: `buildOiPanel` constrói a grade canônica em **`FIVE_MINUTES_MS`**
(`frontend/src/charts/s2-panels.ts:135`) enquanto `buildPricePanel` usa `ONE_MINUTE_MS` (`:125`).

⇒ **o índice lógico `i` é o minuto `i` no Preço e o minuto `5i` no OI.** *"Arrastar uma parte e
tudo não andar junto"* **não é só falta de assinatura — é falta de grade comum.**

⛔ **Consequência de plano, e ela reordena as fases:** ligar `subscribeVisibleLogicalRangeChange`
hoje, sem unificar a grade, produz seis painéis que andam juntos **mostrando instantes
diferentes** — *"um defeito pior que o atual, porque parece consertado"*. A unificação de grade
**precede** o eixo, e o plano foi corrigido para isso (§9, fase `02` item 2.1).

### A-7 ⭐ `CA-5`, como o `PRD-008` o escreveu, **não morde nem cala**

O desenho correto (`D-C3.1`: uma chamada dentro de um registrador, em laço sobre os painéis)
produz contagem **`1`** — e **a malha ingênua também**: a sonda que mede **30 escritas** tem
**exatamente 1** ocorrência textual `[MEDIDO 2026-09-19: loop-probe.mjs]`. ⇒ o `grep` **não
distingue o certo do errado**. E a contagem `6` nem é a hipótese certa de defeito, porque o defeito
real é `A-6`, que nenhum `grep` por nome de função alcança.

⇒ **`CA-5` é substituído por `CA-5a`..`CA-5d`, comportamentais** (§9.1). O `grep` fica como
**higiene, não como aceite**.

### A-8 ⛔ ESCALADO — `klines_volume` armazenado é **sistematicamente subestimado** contra a origem

`[MEDIDO 2026-09-19, n=4 buckets fechados × 240 min = 960 comparações]`: somas **−2,450% /
−4,474% / −2,212% / −2,227%**, pior minuto **−69,6%**, e **`pos=0` nos quatro** — **nunca acima da
verdade**. Viés unilateral não é ruído: é **assinatura de snapshot intrabarra gravado como
`final_only`**.

⇒ **cobertura 100% NÃO implica soma certa**, e a `P-B` de §5.2 mede a primeira sem prometer a
segunda.

⛔ **E isto toca `D1` diretamente, o que o `/architect` não tinha visto:** a vela de F1 **anda no
mesmo coletor** que produz `klines_volume`. Se o defeito for do caminho de gravação e não do campo,
**`OPEN`/`HIGH`/`LOW`/`CLOSE` o herdam** — e um `HIGH` subestimado é **pavio encurtado que ninguém
vê**, exatamente o custo silencioso que `I-3` já nomeia por outro motivo.

**Por isso a fase `01` ganha um DoD que não estava previsto:** comparar a vela **armazenada**
contra a **kline da própria Binance**, e não só contra si mesma (§9, fase `01`, item 9). Dono da
causa raiz: **`/architect` sob `ADR-034`** — **`[M-9]`**, fora do escopo desta feature, **mas o
DoD de `01` o detecta em vez de propagá-lo**.

### A-9 ⛔ ESCALADO — `SEM_PONTO` é ambíguo entre *"zero legítimo"* e *"não lemos"*

Liquidação **zero** é fato; volume **não lido** é ausência. O `SeriesKey` **não tem termo que os
separe**, e `ZL-1..ZL-3` resolve na ingestão sem chegar ao leitor. Trilha nomeada:
`absence_means_zero` no catálogo. **`[M-10]`**, dono `/architect`, **fora desta feature** — mas é
a razão de `RN-1` precisar dos **três** estados de §7.2 em vez de dois.

⚠️ **Correção de fronteira, medida:** `event_time` **é** `bucket_end` (confirmado contra a `fapi`),
logo o fato pertence ao bucket que **TERMINA** em `ceil(t/B)*B`. **`floor` ingênuo desloca a série
em uma barra nativa** — Δ medido de 0,114 pp, **pequeno demais para estourar um teste de ordem de
grandeza**, que é justamente por que precisa estar escrito.

---

## 2. O que esta SPEC fixa

| # | decisão | dono | onde |
|---|---|---|---|
| **D1** | A vela é **4 séries `Reduction`** (`OPEN`/`HIGH`/`LOW`/`CLOSE`) sobre `klines`, grade nativa `1m` — opção **A1** do `PRD-008` §14-A | `/architect` | §3 |
| **D2** | A reagregação por TF mora **na rota** (`B1`), como **função pura de `(nature, reduction)`**, numa implementação só | `/architect`, executando a sucessão de `ADR-034/D6` | §4, §5 |
| **D3** | A tabela dos 8 pares e a **política de cobertura parcial** | **`quant-architect`** (dono nomeado por `D6`) | §5 |
| **D4** | A interface do eixo de tempo mestre `charts`↔`web` | **`frontend-architect`** (dono por `ADR-003`/`ADR-034/D8`) | §6 |
| **D5** | **Teto de profundidade declarado**: o 1m persistido é limitado, e a rota **recusa** além dele em vez de servir vazio | `/architect` | §7 |
| **D6** | A parede assimétrica (preço 2019 · OI/long-short ~30 d) é **dito na tela**, não descoberto | `/architect` + `design_gate` | §7 |
| **D7** | O rótulo de proveniência é **derivado do `SeriesKey`**, e sua chave de máquina **não** deriva de microcopy pt-BR | `/architect` | §8 |
| **D8** | O envelope de `/series-history` passa a declarar **cobertura** (`coverage` + o par `{present, expected}`) — sem isso `beyond-coverage` é indistinguível de `absent` **por construção** | `/architect`, sobre pedido `D-C3.7` | §7.3 |
| **D9** | **Grade canônica única** antes do eixo: todo painel sobre exatamente a mesma grade, lossless com whitespace (`A-6`/`D-C3.2`) | `/architect` + `frontend-architect` | §1-bis `A-6`, §9 |

### 2.1 O que esta SPEC **não** reabre

`ADR-036/D2` (OI fica na origem — a resolução de `[Q1]` **não** o reabre) · `SPEC-006 §5.2`/`I-1`
(ver §3.2: `D1` o **honra**, não o falsifica) · `ADR-003` · `ADR-008/D3` e as 15 colunas ·
`ADR-030/D5` · o predicado de quarentena de `PRD-005`/`SPEC-005` · os 4 eventos de log em português
(linha 10 do `CLAUDE.md` é prospectiva).

---

## 3. `D1` — A forma da vela: quatro leituras de uma chamada já paga

### 3.1 A decisão, e o número que a fecha

**A1 — quatro séries `Reduction`.** O `PRD-008` §14-A apresentou três; esta é a escolhida.

O que decide não é gosto, é que **o padrão já existe, está em produção e foi construído para este
momento**. `use_cases/collector_series_mapping.py` já emite **duas identidades de um array**
(`klines_volume` do índice `[5]` e `cvd_source` de `2·takerBuy[9] − volume`) num laço de pares
`(series_key_id, value_raw)` sobre o mesmo `kline`, com os dezesseis campos de proveniência escritos
uma vez. O próprio módulo declara para que isso foi pago:

> *"a second metric riding an existing collector, with a diff of **ZERO network calls** (`DoD 7`) —
> `T-01.2` already refused to project the 12-field array down, precisely so this moment would cost a
> field read instead of a second integration."* `[DOC: collector_series_mapping.py:436-455]`

E os quatro números estão no array e são descartados:

```bash
grep -n "_INDEX: Final" backend/src/modules/sentimento/infra/binance_klines_client.py
```
→ **4** índices nomeados (`OPEN_TIME`, `VOLUME`, `CLOSE_TIME`, `TAKER_BUY_BASE_VOLUME`); `KLINE_FIELD_NAMES`
(`:49-53`) declara `open`/`high`/`low`/`close` nos índices `[1..4]` e **nenhum acessor os lê**
`[MEDIDO 2026-09-19]`.

⇒ **`D1` transforma o laço de 2 pares num laço de 6 pares.** Custo de rede: **zero chamada nova**.
Custo de cota: **zero**. Custo de schema: **zero**.

### 3.2 Por que `D1` **honra** `SPEC-006/I-1` em vez de falsificá-lo

`I-1` literal (`SPEC-006:230`):

> *"Uma coluna (`value_raw`) basta — sem OHLC | **`series_key_id` já discrimina o quê**; a tabela é
> observação pontual, não candle | se falso, F0 refeita com colunas extras — **schema ainda não está
> em produção** pelo que se mede aqui"*

Duas leituras, e as duas apontam para A1:

1. **A justificativa de `I-1` é a mecânica de A1.** *"`series_key_id` já discrimina o quê"* é
   exatamente o que faz quatro `Reduction` serem quatro séries sobre uma coluna. A prova viva é o
   OI: `sum_open_interest` existe **hoje** como 4 linhas `OPEN`/`HIGH`/`LOW`/`CLOSE` com
   `tsConvention=OHLC_OVER_BUCKET` sobre a mesma `value_raw` `[MEDIDO 2026-09-19, n=4]`.
2. **O custo de A2 SUBIU desde que `I-1` foi escrito.** O falsificador de `I-1` cobra *"F0 refeita
   com colunas extras"*, e o barateava com *"o schema ainda não está em produção"*. **Agora está**
   — a stack de produção serve 60 entradas de catálogo `[MEDIDO 2026-09-19]`. A2 deixou de ser
   "refazer F0" e passou a ser **migração de schema em produção**.

### 3.3 Alternativas recusadas, com custo

| opção | por que foi recusada | custo medido |
|---|---|---|
| **A2 — colunas OHLC na tabela** | falsifica `I-1` explicitamente e dispara *"F0 refeita"*, agora **em produção** (§3.2) | migração de schema com a stack de pé; ganha 1 leitura por painel em vez de 4 |
| **A3 — tupla em `value_raw`** | quebra a premissa de `value_raw` como **decimal-texto** (`SPEC-001` §2.6), que é o que preserva o decimal exato que a corretora cotou | perde a propriedade que `binance_klines_client.py:72-75` existe para defender (*"a float would lose the exact decimal"*) |

### 3.4 A identidade das quatro séries — normativa

| termo | valor | por quê |
|---|---|---|
| `metric` | `klines_ohlc` | segue a convenção `<endpoint>_<field/reduction>` que `klines_volume`/`klines_last` já usam `[DOC: klines_volume_catalog.py:20-24]`. **Nome final é item da fase `01`**, sujeito a `FORBIDDEN_METRIC_NAMES` |
| `interval` | **`1m`** | a mesma razão declarada por `klines_volume`: *"at 1 min the front composes any operating unit from 15 min to 4 h, **and the inverse is impossible**"* `[DOC: klines_volume_catalog.py:34-38]`. É o que torna **verdadeira** a premissa do owner *"é tudo derivado do 1m"* |
| `nature` | `STOCK` | preço é nível num instante; `LOCF` sobre ele é legítimo, soma é erro de tipo |
| `reduction` | `OPEN` · `HIGH` · `LOW` · `CLOSE` | quatro séries, não quatro colunas |
| `ts_convention` | `OHLC_OVER_BUCKET` | quatro leituras **da mesma janela** — a semântica que o enum já declara (`series_key.py:113-114`) |
| `unit` / `denom` | `USDT` / `quote` | é preço, não quantidade — alinha com `klines_last`/`price_mark_close` `[MEDIDO: catálogo]` |
| `provider` / `aggregation_scope` | `binance` / `Symbol` | `ADR-036/D2`, a origem; e as 60 entradas de hoje são todas `Symbol` `[MEDIDO]` |

⛔ **A fonte é `klines`, nunca `price_mark_close`** — `I-3` do `PRD-008`, e o motivo é medido: o mark
price é subamostrado (`count=300`/bucket contra média de **11.245** trades/bucket), e *"os extremos
são subamostrados por construção"* `[DOC: price_source_catalog.py:166-170]`. Extremo subamostrado é
**exatamente `HIGH` e `LOW`**. O custo de errar aqui é **silencioso**: pavio encurtado que ninguém vê.

### 3.5 `RN-2` — a vela degenerada não coexiste com a real (`[Q7]`, `G-5`)

`view-model.ts::rawCandlesFromHistoryRows` hoje monta `{open: close, high: close, low: close,
close, volume: 0}` — **degenerada, documentada e deliberada** (`view-model.ts:30-38`, citando
`SPEC-006 §5.2`/`I-1`) `[MEDIDO 2026-09-19]`.

**Decisão:** ela **sai no mesmo commit** em que a real entra. Sem bandeira, sem convivência.
Duas verdades para o mesmo desenho na mesma tela é o defeito que esta casa mais paga, e a
recomendação do `/pm` em `[Q7]` é adotada. O corte é **item da fase `01`**, não dívida.

### 3.6 Pegada de disco — declarada, e honestamente rotulada (`D-h`, `RNF-3`)

`D-h` exige declarar antes de escrever. O número **não pôde ser medido** (leitura do Postgres de
produção negada pela política do ambiente, §0), então é aritmética:

| grandeza | conta | valor |
|---|---|---|
| linhas/dia/símbolo | `1440 buckets × 4 reduction` | **5.760** |
| linhas/dia, 4 símbolos | `× 4` | **23.040** |
| linhas no teto de `D5` (90 dias), 4 símbolos | `× 90` | **≈ 2,07 M** |

`[INFERRED: aritmética sobre contagem de buckets; o byte/linha é `[NÃO MEDIDO]` — ver §0]`

⇒ **A pegada de disco medida antes e depois é DoD da fase `01`** (§9).

> ⛔ **CORREÇÃO DE INSTRUMENTO, 2026-09-19 — o comando que esta SPEC fixou era CEGO.**
> Onde esta SPEC dizia `pg_total_relation_size('md.series')`, leia **`hypertable_size('md.series')`**.
> `md.series` é hypertable TimescaleDB: as linhas moram nos *chunks*, e `pg_total_relation_size`
> mede só a tabela-pai, que fica vazia — **`24576` contra `1505697792` no mesmo instante, razão de
> 61.266×** `[MEDIDO 2026-09-19, `psql -Atc "select pg_total_relation_size('md.series'),
> hypertable_size('md.series')"`]`. Lido antes/depois, o original devolveria `24.576 → 24.576` e o
> portão concluiria *"não custou disco"* (o modo de falha do `rc=0` de `ADR-012`).
> **Muda só o comando** — o requisito, o teto de 90 dias e o universo seguem idênticos. Achado por
> `T-01.5`; conferido pelo loop principal. Detalhe em `docs/plans/SPEC-008-candle-real-e-eixo-unico/01_vela.md` DoD 6. Sem o teto de `D5`, a mesma
conta desde `2019-09-08` daria **≈ 14,8 M linhas por símbolo** `[INFERRED: 2.568 dias × 1440 × 4, conferido em python3]` —
é por isso que `D5` existe.

---

## 4. `D2` — Onde mora a reagregação: na rota

**B1.** A escolha é forçada por um requisito do próprio PRD, não por preferência: `RF-7` exige que a
reagregação seja **uma implementação, num lugar só**, e `RN-3` põe a regra em termos de `Nature` —
que é um enum de **domínio Python** (`series_key.py:85-97`), junto de `CARRY_FORWARD_BY_NATURE`
(`as_of_accessor.py:112-118`). B2 obrigaria a **reescrever a tabela dos 8 pares em TypeScript**, e
duas implementações da mesma regra é o modo de falha que `RF-7` foi escrito para proibir.

O segundo argumento é de transporte, e é aritmético:

| | pontos por painel, `4h × 500 velas` | contra hoje |
|---|---|---|
| **B1** (rota reagrega) | **500** | — |
| **B2** (browser reagrega, fio continua `1m`) | `500 × 4h × 60` = **120.000** | **20,8×** os `5.760` de hoje `[MEDIDO: data-oi-wire-points="5760"]` |

⇒ B2 custa **240× mais fio que B1** para a mesma tela, em **seis** painéis.

⭐ **E o byte/linha do fio foi MEDIDO pelo `frontend-architect` depois desta conta, confirmando-a:**
```bash
curl -s -o /dev/null -w "%{size_download}\n" '.../series-history?…&interval=1m&<janela de 4 dias>'
# 570607  (n_rows=5760)  ⇒  99,06 B/linha
```
`[MEDIDO 2026-09-19, n=1 resposta, série sum_open_interest/POINT, BTCUSDT]` ⇒ em `4h`, B2 =
**11,9 MB por série**, e com **7 séries na tela ≈ 83 MB por troca de TF**, sobre a premissa de
infra do owner (*VPS compartilhada*, `[PREMISSA-OWNER: 2026-08-25]`). Só o `setData` desses
129.600 pontos × 6 painéis custa **752,6 ms** de thread principal, **antes** de qualquer agregação.

⚠️ **Este número é de FIO (JSON), não de DISCO.** Ele **não** fecha o `[NÃO MEDIDO]` de §3.6 —
byte de linha no Postgres é outra grandeza, e confundi-los seria exatamente o tipo de empréstimo de
número que o `CLAUDE.md` proíbe.

**B3 (híbrido) recusado:** mais superfície de contrato sem resolver `RF-7` — a reagregação
continuaria podendo acontecer nos dois lados.

**O que B1 muda em `ADR-034/D6`:** `SUPPORTED_INTERVAL` deixa de ser a constante `"1m"`
(`series_history.py:48`, com a recusa em `:180-183`) e passa a ser o **conjunto** `{1m, 5m, 15m, 1h,
4h}` — os quatro TFs de `[Q2]` mais a grade nativa. **Todo `interval` fora do conjunto continua
recusado** (`422`): a decisão de `D6` de *"recusar, nunca servir número subestimado"* é **mantida
palavra por palavra**; só o conjunto do que é servível cresce, e cresce porque a função de
agregação passou a existir. **Isto exige `ADR-040`** (§10).

---

## 5. `D3` — A tabela dos 8 pares e a cobertura parcial · **DELEGADO ao `quant-architect`**

⛔ **Esta seção não é decidida pelo `/architect`.** `ADR-034/D6` nomeou o dono deste trabalho —
`quant-architect` — e o gatilho dele disparou (`A-2`). Decidir aqui seria o `/architect` se
auto-atribuindo a sucessão de uma ADR que já tem dono escrito.

**O que foi delegado, e é normativo que volte respondido antes de a fase `03` entrar em plano:**

1. **A função de cada um dos 8 pares medidos** (`A-1`), com `OPEN`=primeiro, `HIGH`=máx, `LOW`=mín,
   `CLOSE`/`LAST`/`POINT`=último como ponto de partida a ser ratificado ou corrigido com número.
2. **A política de cobertura parcial** que `D6` nomeou e ninguém escreveu (`A-3`): bucket **fechado**
   de `4h` com 180 de 240 fatos de 1 min — recusar, servir com marca de cobertura, ou limiar.
3. **O ramo viável de `(RATIO, POINT)`** dado que os componentes não existem (`A-4`).
4. **O falsificador que MORDE trocando uma função por outra** — exigência literal do documento do
   owner.

**Julgamento RECEBIDO em 2026-09-19:**
[`handoff/JULGAMENTO-QUANT-ARCHITECT.md`](../context/candle-real-e-eixo-unico/handoff/JULGAMENTO-QUANT-ARCHITECT.md)
(328 linhas). **`[M-3]` está FECHADO.** O que ele decidiu, e é normativo:

### 5.1 `reduce(nature, reduction)` — total sobre os 8 pares, sem ramo `default`

`(FLOW,SUM)`=**Σ** · `(STOCK,OPEN)`=**first** · `(STOCK,HIGH)`=**max, da própria série `HIGH`** ·
`(STOCK,LOW)`=**min, da própria `LOW`** · `(STOCK,CLOSE)`=**last** · `(STOCK,LAST)`=**last** ·
`(STOCK,POINT)`=**last** · `(RATIO,POINT)`=**last sob allowlist**.

`ts_convention` **não entra na chave**: a única colisão (`(STOCK,CLOSE)` = `price_mark_close`
`POINT_AT_BUCKET_END` **+** `sum_open_interest` `OHLC_OVER_BUCKET`) pede a **mesma** função.
⛔ **Um 9º par tem de quebrar o build** — sem ramo `default`.

### 5.2 Cobertura parcial: **`P-B` — servir SEMPRE, com o par de inteiros; nunca recusar, nunca limiar**

⚠️ **Isto CORRIGE o que `ADR-040/D3` deixou em aberto e derruba a opção "recusar"**, com três
números que o `/architect` não tinha:

1. **A completude PIORA com o TF**: `klines_volume` **93,0%** (`5m`) → 90,7% → 84,7% →
   **78,3%** (`4h`) `[MEDIDO 2026-09-19, n=4.604/1.532/380/92 buckets fechados]` ⇒ *"recusar se
   < 100%"* **apagaria 21,7% das barras de `4h`**.
2. **Percentual não é unidade transportável**: 1 minuto faltando é **80%** em `5m` e **99,6%** em `4h`.
3. ⛔ **`sum_liquidation` tem 0,0% de buckets completos em TODO TF** (301 valores / 5.460 `SEM_PONTO`,
   `n=5.761`) ⇒ **qualquer limiar apaga o painel inteiro**.

⇒ a rota serve **sempre**, acompanhada de `{"present": 81, "expected": 240}` — **par de inteiros,
nunca bool, nunca percentual** — e **nunca extrapola**. A magnitude do que estava invisível:
bucket fechado de 2026-09-16 00:00, 81/240, `Σ = 4.246,891 BTC`, **subestima ~66,2%** e a tela
não diz nada hoje.

O default é por **regime de erro**, não por `nature`: regime **A** (`Σ`/`max`/`min` — viés
unilateral, sem cota) serve parcial **com marca visível**; regime **B** (`first`/`last` — erro
limitado por frescor) usa o mecanismo que já existe, `maxStalenessMs` (`ADR-006`).

### 5.3 `(RATIO, POINT)`: `last` sob **allowlist de métrica de 1 elemento**

Recompor é impossível hoje (`A-4`) — **e ingerir os componentes não resolveria**: o fio mede que
`longAccount`/`shortAccount` são **frações que somam 1**, não contagens, então somá-las dá
`média/média`, outro estimador. Conclusão mais forte que a minha: para **razão de estoque não
existe "agregado sobre o bucket"**, só *"qual instante você reporta"*.

⇒ `last`, rotulado *"razão no fechamento do bucket"*, habilitado por **allowlist de `metric`
(1 elemento: `count_long_short_ratio`)** e **não** por `nature` — porque `SeriesKey` tem **um**
membro `RATIO` para **dois** comportamentos, e razão de **fluxo** somada infla **3,3×**
(p50 `3,1809` contra `0,9707`) `[MEDIDO 2026-09-19]`.

### 5.4 O falsificador: `CA-8` **atual morde 1 de 20 trocas** ⇒ substituído por `CA-8′`

⛔ E o `CA-8` do `PRD-008` **passa verde sobre a vela degenerada** que `RN-2` mede existir — ou
seja, hoje ele não distingue o defeito do conserto. `CA-8′` tem 4 camadas: guarda de
**não-degenerescência primeiro**; fixture de mercado real **colhida da Binance, não do nosso
banco**; **matriz exaustiva 8 pares × 5 funções = 20 asserções**; e ablação de cobertura (81/240)
exigindo que `mean × 240` **não** apareça. Os números da fixture estão em §9/fase `03`.

---

## 6. `D4` — O eixo de tempo mestre · **DELEGADO ao `frontend-architect`**

⛔ **Decisão estrutural sob `frontend/src/` ⇒ dono é o `frontend-architect`**
(`ADR-003`/`ADR-034/D8`). O `/architect` não a toma.

**Baseline medida, para o julgamento não começar do zero:**

```bash
grep -c "useLightweightChart(" frontend/src/app/symbol/SymbolClient.tsx          # 6
grep -rn "subscribeVisibleLogicalRangeChange" frontend/src --include='*.ts*' | wc -l   # 0
```
→ **6** gráficos independentes, cada um com `fitContent()` próprio (`:435`); **0** assinaturas em
todo `frontend/src`, headless incluídos `[MEDIDO 2026-09-19]`.

**O que foi delegado:** quem é dono do range visível e quem assina; como o laço de realimentação
entre 6 gráficos é cortado; logical range vs. time range quando a grade muda de `1m` para `4h`; e
quem detecta a borda na história sob demanda.

**Julgamento RECEBIDO em 2026-09-19:**
[`handoff/JULGAMENTO-FRONTEND-ARCHITECT.md`](../context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md)
(506 linhas, `D-C3.1`..`D-C3.7`). **`[M-4]` está FECHADO.** O que ele decidiu, e é normativo:

- **`D-C3.1`** o dono do range é um `TimeAxisController` **puro em `charts`** (sem `IChartApi`, sem
  `fetch` — `ADR-003/FR-1+FR-2`); `web` assina, despacha e aplica.
- ⛔ **`D-C3.2` — e esta é a correção que muda o desenho: a guarda de reentrância NÃO é o
  mecanismo.** A malha ingênua **não estoura** (`n=6`: 6 notificações, 30 escritas, profundidade 1 —
  a notificação é assíncrona e um `set` idêntico dá **+0**). **O que morde é grade divergente:**
  CALA (grades iguais) = **0 min** de desalinhamento; MORDE (grades podadas) = **5.460 min (91 h)**
  *com a guarda ligada* `[MEDIDO 2026-09-19: loop-probe2.mjs, lightweight-charts 5.2.1 + jsdom]`.
  ⇒ **invariante: todo painel sobre exatamente a mesma grade canônica, lossless com whitespace.**
- **`D-C3.3`** o estado de registro é em **INSTANTES**; `logicalRange` é só formato de fio,
  convertido por aritmética pura. Range lógico cru de `1m`→`4h` erra **325,3 h**; via tempo,
  **2,7 h** (< 1 bucket de 4 h) `[MEDIDO: probe4.mjs]`.
- **`D-C3.4`** a borda é detectada por **aritmética sobre a grade** — ⛔ **nunca
  `barsInLogicalRange`**: com whitespace à frente ele devolve `barsBefore = −4.608`, detector
  permanentemente disparado = **laço infinito de paginação** `[MEDIDO: probe3.mjs]`.
- **`D-C3.5`** `web` pagina **serial**, teto ~**5.000 slots** — a biblioteca **não tem `prepend`**,
  então o custo é **quadrático** em páginas; `setData` de 129.600 pts × 6 painéis = **752,6 ms**.
- **`D-C3.6`** ⛔ **três** estados distinguíveis, nunca dois: `absent` · `not-loaded` ·
  `beyond-coverage`.
- **`D-C3.7`** (pedido formal ao `/architect`, **aceito** — vira `D8`, §8.3).

**E uma correção de contagem que o `PRD-008`/`M8` acertou pelo caminho errado:** `grep -c` **= 6**
conta **a definição mais 5 sítios de chamada**; são **6 gráficos em runtime** porque
`LiquidationCohortSurface` monta **2×** (`SymbolClient.tsx:1503,1510`). O caminho errado importa
porque `CA-5` é escrito **como contagem de `grep`** — ver §9.1.

---

## 7. `D5`/`D6` — História sob demanda, o teto, e a parede que a tela tem de dizer

`[PREMISSA-OWNER: 2026-09-19]`, literal — requisito **novo**, não estava no `PRD-008`:

> *"únco ponto é que a depender do zoom e movimentação da tela, tvz haja um espécie de navegação
> infinita, n sei como o TV e coinalyze resolvem isso. Então acho válido ser pensado essa navegação
> e zooms"*

### 7.0 ⛔ EMENDA 2026-09-20 — o pré-requisito que `D5` não tinha: **paginar não traz barra hoje**

`D5` supõe que existe o que paginar. **Não existe pela rota**, e a causa não é defeito: o backfill
de 90 dias está no banco (**2.148.504 linhas**, **1,641 GB**, run `ACCEPTED`) e `R-1`
(`available_at <= t`, `t` = **a fatia**) o recusa, **corretamente** — a linha tem
`available_at − bucket_end ≈ 33 h` e servi-la na fatia de 33 h antes **seria lookahead**.

```
psql   -> 240 linhas   |   /series-history na MESMA janela -> absence {SEM_PONTO: 241}
```
`[MEDIDO 2026-09-19, gates/T-01.5-dod6-medicao-e-achado-lookahead.md]`

⇒ **`[M-12]`**, decidida por
[`ADR-042`](../adr/ADR-042-dois-relogios-available-at-responde-ao-horizonte-de-conhecimento-nao-a-fatia.md):
`bucket_end` responde à fatia (*valid time*), `available_at` responde ao **horizonte de
conhecimento** `K` (*transaction time*). Com `K = t`, o modo de decisão é **idêntico** ao de hoje;
`K > t` é admitido **somente** sob `ReadPurpose.RENDERING`, e `ENTRY_CONDITION`/
`EXECUTION_SIMULATION` **levantam**. **Execução em `T-05.0`**, pré-requisito de `T-05.1`/`T-05.8`.

⚠️ **O que a emenda NÃO autoriza:** afrouxar `R-1`. Contagem de barras subindo **sem** o portão
`D3` da `ADR-042` é o lookahead voltando pela porta que `D5` abriu.

### 7.1 `D5` — *"navegação infinita"* é **paginada e com teto**, e o teto é declarado

A palavra do owner é *"espécie de"*, e a engenharia honesta aqui é dizer onde para. Três fatos
medidos fixam o teto:

| fato | número | fonte |
|---|---|---|
| profundidade de `klines` | desde **2019-09-08** | `[DOC: ADR-036/D5:61,152]` |
| teto de `limit` por chamada | **1.500** velas, **weight 1**, contra **2.400/min** por IP | `[DOC: binance_klines_client.py:66; ADR-036:152]` |
| parede de `/futures/data/*` | **~30 dias** (`startTime` de −60 d → **HTTP 400**) | `[MEDIDO 2026-09-10, DOC: ADR-036/D5:58-59]` |

**Decisão `D5`:** o 1m persistido tem **teto declarado de 90 dias** por símbolo. A razão não é
arbitrária: o TF mais grosso de `[Q2]` (`4h`) com a janela de `[Q3]` (~500 velas) precisa de
`500 × 4h = 2.000 h ≈ 83,3 dias` `[INFERRED: aritmética sobre `[Q2]`+`[Q3]`]`. **90 dias é o menor
teto redondo que cobre o pedido do owner inteiro**, e mantém a pegada em ≈ 2,07 M linhas (§3.6) em
vez das ≈ 14,8 M por símbolo que "desde 2019" custaria.

⛔ **Além do teto, a rota RECUSA — não serve vazio.** Arrastar para antes de 90 dias devolve uma
recusa explícita que a tela sabe desenhar. Servir `200` com zero linha ali seria produzir
exatamente o `rc=0` ambíguo de `ADR-012`: indistinguível entre *"não há dado"* e *"o instrumento
nunca alcançou"*.

**Custo de backfill até o teto, declarado:** `90 dias × 1440 min ÷ 1.500 por chamada` = **87
chamadas por símbolo**, weight 1 cada, contra teto de 2.400/min `[INFERRED: aritmética sobre os
números medidos acima]` ⇒ **< 4% de um minuto de cota** para um símbolo inteiro. E o backfill é
**one-shot/cron, nunca serviço de vida longa** (`ADR-027/D1`, `D-i`).

### 7.2 `D6` — ⛔ A parede **NÃO é a da fonte**: é a do nosso armazém, e é um QUEIJO SUÍÇO

⚠️ **Esta é a correção mais cara do Gap Analysis, e ela desmonta a premissa que o `PRD-008`
(`[Q3]`), o documento do owner e a §7.1 desta SPEC carregavam.** Todos descrevem a parede como
**da fonte** — *"preço desde 2019, OI/long-short ~30 dias"*. O `frontend-architect` sondou o
**nosso** `/series-history` e mediu outra coisa
`[MEDIDO 2026-09-19: 56 sondas de 60 grades contra /series-history]`:

| série | até onde o NOSSO armazém tem dado |
|---|---|
| `sum_open_interest` | morre entre **8 e 11 dias** |
| `cvd_source`, `count_long_short_ratio`, `sum_liquidation` | morrem entre **4 e 6 dias** |
| `klines_last`, `price_mark_close` | **0 em todas as 8 profundidades** (é `M2`: sem escritor) |
| `klines_volume` | **`0` a 6 dias e `59` a 8 dias** — **não monotônico** |

⛔ **A não-monotonicidade é o achado dentro do achado:** inferir parede a partir de contagem de
linhas é **errado por construção**, porque o armazém tem **buracos no meio**, não uma borda.

**A consequência aritmética, e ela é dura:** contra ~500 velas, `4h` = **83,3 dias** ⇒
**~11% do OI e ~6% do CVD** têm dado — **na primeira renderização**, não ao arrastar
`[MEDIDO/INFERRED: sondas acima × a janela de `[Q3]`]`.

⇒ **`F3` (barra de TF) entrega botões que mostram tela quase vazia** se o backfill não andar junto.
`B1` **não conserta isto**: reagregar `1m`→`4h` sobre 5 dias de CVD devolve 500 velas das quais
~470 são vazias, só que mais rápido e com menos bytes. **Onde mora a reagregação e quanto há para
reagregar são ortogonais**, e o segundo é backfill (`D5`, one-shot/cron — `ADR-027/D1`).

**Normativo — e agora são TRÊS estados, não dois** (`D-C3.6`), porque o queijo suíço torna
`absent` e `beyond-coverage` genuinamente diferentes:

| estado | significa | hoje |
|---|---|---|
| `absent` | o bucket está **dentro** da cobertura e mesmo assim não há ponto (buraco) | indistinguível |
| `not-loaded` | ainda não paginamos até aqui | indistinguível |
| `beyond-coverage` | está **fora** do que o armazém/fonte alcança | indistinguível |

É `RN-1` (*"não sabemos" e "foi zero" nunca são os mesmos pixels*) aplicado ao **eixo do tempo**, e
o horizonte vem do **envelope da rota** (`D8`), nunca de constante escrita à mão.

⚠️ **O desenho desses estados é do `design_gate`** (`ux-ui-mastery`), pela autonomia delegada do
`CLAUDE.md`. Esta SPEC fixa que eles **existem e são distinguíveis**; não fixa a aparência.

### 7.3 `D8` — O envelope de `/series-history` passa a declarar COBERTURA

**Pedido formal `D-C3.7` do `frontend-architect`, aceito.** Hoje o envelope `panel` carrega
`series_key_id`/`source`/`nature`/`unit`/`native_grid_ms`/`grid_multiple` e **nada de cobertura**
`[MEDIDO 2026-09-19]` ⇒ **`beyond-coverage` é indistinguível de `absent` POR CONSTRUÇÃO**, e
nenhum esforço de front resolve isso.

**Normativo:** o envelope ganha `coverage { earliest_bucket_ms, latest_bucket_ms, source_floor_ms }`
e, por bucket reagregado, o par de inteiros `{present, expected}` de §5.2. **Os dois são a mesma
decisão vista de dois lados** — sem eles, `D6` é irrealizável e `P-B` é indizível.

---

## 8. `D7` — O rótulo do OI, e a chave de máquina que não pode nascer de microcopy

### 8.1 A resolução de `[Q1]` — o veto NÃO foi exercido, e o rótulo SUBIU

⭐ **`[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]`** — **o OI fica na
origem: Binance USDT-M, em contratos (`unit=BTC`, `denom=base`)**. `ADR-036/D2` **não é reaberta**,
`RN-6` não dispara, nenhuma exposição nova a terceiro, e a série da tela é a mesma que o backtest
enxerga.

⇒ **`F5` do `PRD-008` NÃO entra em plano.** A opção **C1** de §14-C é a vigente.

> ⛔ **A versão anterior desta seção rotulava isto como `[INFERRED: aplicação literal da regra do
> owner …]`, e estava certa ENQUANTO era dedução de agente. Deixou de ser.** Em 2026-09-19 o owner
> **escolheu** *"mantém — origem, Binance, contratos"* sobre um menu com o custo do agregado
> declarado (**25%** do teto a 4 exchanges, **145% — estoura** a 28). Os dois rótulos **não são o
> mesmo ato** (`CLAUDE.md`): `[INFERRED]` é leitura adotada por agente, `[DECISÃO-OWNER]` é escolha
> dele entre opções redigidas com custo.
>
> **E a diferença é operacional, não de etiqueta:** uma dedução de agente cai diante de argumento
> novo; **uma escolha do owner só é revertida por ele**. Quem reabrir isto depois precisa saber
> qual dos dois está reabrindo. **`F5` está fora por DECISÃO, não por dedução.**

⚠️ Segue reversível **pelo owner** — `[M-2]` permanece nomeado para isso, agora como "decisão que
ele pode mudar", não como "conclusão que um argumento derruba".

**E a unidade permanece contratos, não USD** — porque nocional = contratos × preço, e o caso que o
owner declarou querer ler (*"mercado caiu e open interest subiu"*) é justamente o que o nocional
apaga. `[DOC: DECISOES-DO-OWNER §Q1]`

### 8.2 `RF-8`/`RN-5` — o rótulo é derivado, e a chave é ASCII estável

O rótulo soletra **grandeza · universo · coorte** lidos do `SeriesKey` servido. `CA-10` morde
trocando a chave no catálogo de teste: se o rótulo não muda, está escrito à mão.

⛔ **E a chave de máquina não deriva do rótulo.** Hoje `SymbolClient.tsx:2192` monta
`data-fact={\`live_${label}:…\`}` a partir da **string visível**, e a página publica
`data-fact="live_preço:attempted"` — **com acento** `[MEDIDO 2026-09-19]`. Trocar a microcopy pt-BR
muda, **em silêncio**, a chave que o QA asserta.

**Decisão sobre `[Q6]`/`G-4`: consertar agora, junto com `C-4`, não abrir dívida.** O motivo é de
custo, não de gosto: `D7` cria uma chave nova (`oi_provenance`) que `CA-9` vai assertar, e deixar o
defeito vivo ao lado dela é convidar a repeti-lo. A chave é **ASCII, derivada do `SeriesKey`**,
nunca da microcopy — e a microcopy continua em **pt-BR** (linha 8 da tabela de fronteira do
`CLAUDE.md`), o que só é possível porque as duas **deixam de ser a mesma string**.

---

## 9. O `DoD-VERTICAL` instanciado — quatro fases, quatro pixels

`[PREMISSA-OWNER: 2026-09-10]` desta casa: **fase = uma métrica até o pixel**. As quatro fases são
os quatro falsificadores `P1`..`P4` do `PRD-008` §2, um por fase, cada um com **ablação**.

⛔ **`Assert de DOM não prova pixel`** já mordeu neste repositório: elemento pode passar em tudo e
não existir na tela. **Todo DoD de pixel abaixo exige ablação** — remover a causa tem de **apagar** o
pixel — e Playwright **contra o app real**, com assert de posição, nunca só status HTTP.

⛔ **Purgar `__pycache__` antes de acreditar em verde ou vermelho** (`CA-12`).

| fase | componente | o pixel | DoD — comando e universo |
|---|---|---|---|
| **`01`** vela real | `sentimento` + `web` | `P1`: corpo e pavio | `curl` da chave de preço: `≥ 1` bucket com `high > low` sobre `n = 500` velas da janela; `data-fact="price_last_reading:…"` deixa de ser `absent`; **ablação**: sem o produtor, o corpo some; `hypertable_size` antes/depois (§3.6 — ⛔ NÃO `pg_total_relation_size`, cego em hypertable); `make verify` verde |
| **`02`** grade única + eixo | `web`/`charts` | `P2`: pan move os cinco | **`CA-5a`..`CA-5d`** (§9.1) — ⛔ **não** a contagem de `grep`; **ablação**: desligada a assinatura, os 5 param |
| **`03`** TF único | `sentimento`/`web` | `P3`: TF reagrega todos | Playwright: clicar `4h` muda a contagem de barras dos **6** painéis; teste diferencial sobre os **8 pares** de `A-1` (`STOCK` reagregado ≠ soma; `OPEN` ≠ `CLOSE` do mesmo bucket); `interval` fora de `{1m,5m,15m,1h,4h}` → `422`, `n = 3` casos |
| **`04`** OI honesto | `web` | `P4`: rótulo soletra os três termos | `data-fact="oi_provenance:…"` contém grandeza+universo+coorte; **ablação de derivação** (`CA-10`): trocar a chave no catálogo de teste muda o rótulo; **`0`** chaves `data-fact` com caractere não-ASCII em toda a página |

**`05`** (história sob demanda, `D5`/`D6`) entra **depois de `02`**, porque depende do eixo que
`02` define — fase própria, pixel próprio: arrastar para antes do horizonte mostra o estado
**nomeado**, e a ablação é que removê-lo faz o painel voltar a esvaziar em silêncio.

### 9.1 `CA-5` substituído — os quatro critérios comportamentais

⛔ **`CA-5` do `PRD-008` é retirado, não corrigido em silêncio.** `A-7` mede que ele **não
distingue o desenho correto da malha ingênua** (ambos dão contagem `1`). O `grep` permanece como
**higiene, nunca como aceite**. Os quatro substitutos, com os números de referência medidos pelo
`frontend-architect` nesta rodada:

| id | critério | morde quando |
|---|---|---|
| **`CA-5a`** | **uma** grade: todo painel publica o mesmo `slots` — `grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <página> \| cut -d: -f2 \| sort -u \| wc -l` | `≠ 1`. **Hoje dá `2`** (`5760` e `1152`) `[MEDIDO 2026-09-19]` |
| **`CA-5b`** | o **par morde/cala** do eixo, headless com 6 gráficos: CALA (grades iguais) = `desalinhamento 0 min`; MORDE (grades podadas) = `> 0` | o caso MORDE **passa** ⇒ o teste mede *"algo se moveu"*, não alinhamento. Referência: **5.460 min (91 h)** |
| **`CA-5c`** | o remonte **não amplifica**: contador de `setVisibleLogicalRange` por **um** pan | `> 5` para `N=6` — a malha ingênua dá **30** |
| **`CA-5d`** | o TF **preserva o instante**: trocar `1m`→`4h` com o range fixo, erro de borda `< 1 bucket do TF novo` | **`325,3 h`** (o caminho do range lógico cru); via tempo dá **2,7 h** |

**Nenhum dos quatro é obtenível por `grep`** — e é exatamente por isso que substituem um critério
que era.

⛔ **`[P-seed]`:** nada de OHLC sintético no Postgres compartilhado. Backfill **lido da origem** não
é dado de teste; fixture de teste não vai para o banco compartilhado.

---

## 10. `ADR-040` — a ADR que esta SPEC exige

**`D2` fecha uma alternativa e muda uma constante que outra ADR fixou** ⇒ exige ADR própria, com
falsificador e alternativas recusadas com custo:

**`ADR-040` — `SUPPORTED_INTERVAL` vira conjunto: a reagregação mora na rota, e é função de
`(nature, reduction)`.** Escrita junto desta SPEC (§11), executando a sucessão que `ADR-034/D6`
agendou e citando o dono que ela nomeou.

As demais decisões **não** geram ADR: `D1` escolhe o caminho que `SPEC-006/I-1` já prescrevia (§3.2)
sem fechar alternativa nova; `D3`/`D4` são delegadas; `D5`/`D6`/`D7` são fixação de contrato dentro
do que as ADRs em vigor já permitem.

---

## 11. O que esta SPEC **não** decide — com dono e gatilho

| # | aberto | dono | gatilho |
|---|---|---|---|
| ~~`[M-1]`~~ | ✅ **RESOLVIDA 2026-09-19 — a política é a verdade: `components` são 7, com `infra`.** `CLAUDE.md` emendado em 2 superfícies (vocabulário + linha 9 da tabela); `harness.toml` intocado | **owner** | fechada — ver nota em §11.1 |
| **`[M-2]`** | ✅ **RESOLVIDA 2026-09-19 — o veto NÃO foi exercido** (`[DECISÃO-OWNER]`, §8.1). Segue reversível **só pelo owner**: OI agregado multi-exchange, se ele quiser pagar 25%–145% do teto | **owner**, sob `ADR-036` | `F5` volta ao plano **só** por nova decisão dele |
| ~~`[M-3]`~~ | ✅ **FECHADO 2026-09-19** — tabela dos 8 pares + `P-B` de cobertura parcial | `quant-architect` | §5, julgamento em disco |
| ~~`[M-4]`~~ | ✅ **FECHADO 2026-09-19** — `D-C3.1`..`D-C3.7` | `frontend-architect` | §6, julgamento em disco |
| **`[M-9]`** | ✅ **CAUSA-RAIZ ACHADA 2026-09-20 — [`ADR-041`](../adr/ADR-041-a-cauda-viva-le-uma-barra-que-a-origem-ainda-nao-assentou-a-causa-raiz-de-m9.md).** A `fapi` **continua alterando a barra que já declarou fechada** por alguns segundos depois de `bucket_end`, e a cauda viva lê em `bucket_end + 2 s` e grava `is_final=True`. Uma leitura de PREFIXO explica os **cinco** sinais de uma vez: `OPEN` exato, `VOLUME` e `HIGH` só para baixo, `LOW` só para cima, `CLOSE` simétrico. **Conserto: o offset do poll, medido, não `is_closed_bucket`.** ⛔ Continua valendo: **nenhum backtest deve usar `klines_volume` como verdade de volume sobre o dado escrito ANTES do conserto** | **`quant-architect`**, sucedendo `ADR-034` | a re-medição de `DoD-9` da fase `01` (comando em `ADR-041`) |
| **`[M-12]`** | ✅ **DECIDIDA 2026-09-20 — [`ADR-042`](../adr/ADR-042-dois-relogios-available-at-responde-ao-horizonte-de-conhecimento-nao-a-fatia.md).** O backfill de 90 dias (**2.148.504 linhas, 1,641 GB**) é **invisível para a rota**: `R-1` é `available_at <= t` com `t` = a fatia, e servir a linha de 33 h depois **seria lookahead**. Decisão: `R-1` liga `available_at` ao **horizonte de conhecimento** `K`; com `K = t` nada muda; `K > t` só sob `RENDERING`. **Execução: `T-05.0`, pré-requisito de `T-05.1`/`T-05.8`** | **`quant-architect`**, com efeito em `ADR-006`/`SPEC-001` §2.3 | fase `05`; `SPEC-001` §2.3 emendada quando `ADR-042` sair de `proposta` |
| **`[M-10]`** | `SEM_PONTO` ambíguo entre *"zero legítimo"* e *"não lemos"*; trilha `absence_means_zero` no catálogo | `/architect` | **fora desta feature** (`A-9`) |
| **`[M-11]`** | `R4` — OHLC da própria razão long/short (16 entradas, **zero cota**), nomeada pelo `quant-architect` e **não construída** | `quant-architect` | quando a razão precisar de extremos |
| ~~`[M-5]`~~ | ✅ **RESPONDIDA 2026-09-19 — deixou de ser `[NÃO MEDIDO]`:** **16 ms** (um quadro a 60 fps) para pan/zoom e **400 ms** para história nova aparecer. `[DECISÃO-OWNER, escolha entre alternativas apresentadas]` | **owner** | DoD 7 das fases `02` e `05` |
| **`[M-6]`** | A escala `log10` do volume sob TF variável (`[Q8]`) | `design_gate` | fase `03`; **até prova em contrário, continua** |
| **`[M-7]`** | O nome exato do segmento da rota `/symbol/[symbol]` — **inglês** está fixado (linha 12 do `CLAUDE.md`), o nome não | `frontend-architect` | fase `02` |
| **`[M-8]`** | Renomear `janela_de_perda` e as 4 mensagens/eventos em português | `ADR-008/D3` · linha 10 | **não é desta feature** |
| **`[M-13]`** | Mecanismo de **indisponibilidade POR TIMEFRAME** (toggle/exclamação por métrica: *"esse indicador não está disponível neste TF"*) — **declarado e não construído**, ver §11.2 | `/architect` da feature que introduzir uma grade nativa mais grossa que `5min` | o dia em que essa grade entrar no catálogo — hoje não existe |

### 11.1 Nota sobre `[M-1]`: o `infra` do falsificador de idioma **não é** o `infra` do vocabulário

O `CLAUDE.md` foi emendado (7 componentes), e **`infra` NÃO foi acrescentado à exclusão do
falsificador de idioma** — o `grep -vxE 'sentimento|charts|convergencia|backtest|web|docs'`
continua como está. **Concordo com o raciocínio, e registro o porquê para ninguém o "consertar"
depois:**

São **dois referentes com o mesmo nome**. O `infra` do vocabulário é **componente**, e mapeia para
`deploy/` — **fora** do universo do falsificador, que é *segmento de diretório sob `backend/src`,
`backend/tests`, `frontend/src`*. O `infra` que aparece **dentro** daquele universo é **nome de
camada**, irmão de `domain/` e `use_cases/` (é o `infra/` de `binance_klines_client.py`, citado
nesta SPEC §3.1). Acrescentá-lo à exclusão **suprimiria da lista um segmento legítimo em inglês**,
que é o oposto do que a exclusão existe para fazer.

E a medição confirma que a emenda não moveu o instrumento: com e sem `infra` na exclusão o
falsificador devolve **a mesma lista** — **23 contra 22 segmentos, zero em português nos dois**
`[MEDIDO 2026-09-19 pelo loop principal]`.

⚠️ **O gatilho que reabriria isto, e ele é específico:** se algum dia existir
`backend/src/modules/infra/` **como caminho de componente** (e não como camada), os dois referentes
colidem — e aí a exclusão passa a ser necessária **pelo motivo certo**, não por simetria com a
tabela. Hoje não existe.

### 11.2 `[M-13]`: por que a indisponibilidade POR TF não nasce nesta feature — e a correção sobre o gatilho

`T-05.11` (`CST-244`, `tasks.toml:847-861`) pediu esta declaração a partir da pergunta literal do
owner `[PREMISSA-OWNER: 2026-09-19]`: *"sobre o TF, OI por exemplo, se ele n tem 1min, nao vamos
exibir esse indicador no TF onde ele n ta disponivel, dai ele pode ficar com uma toggle de
exclamacao avisando que ta indisponivel naquele TF. tirando o OI, tem outros nesse mesmo escopo?"*

**A resposta medida, hoje (2026-09-23), não em 2026-09-19:**

```bash
curl -s http://127.0.0.1:8000/api/v1/series-catalog | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(len(d['entries']), sorted(set(e['nativeGrid'] for e in d['entries'])))"
# 76 [1min, 5min]  — 4 símbolos (BTCUSDT, ETHUSDT, LINKUSDT, SOLUSDT)
```

Continuam existindo **apenas duas grades nativas** em todo o catálogo: `1min`
(`klines_ohlc`, `klines_volume`, `cvd_source`, `sum_liquidation`) e `5min`
(`sum_open_interest`, `klines_last`, `price_mark_close`, `count_long_short_ratio`)
`[MEDIDO 2026-09-23]`. A contagem de entradas subiu de 60 (2026-09-19) para 76 — `klines_ohlc`
entrou com a fase `01` — mas o **conjunto de grades nativas não mudou**.

⚠️ **Correção sobre o gatilho que `tasks.toml` nomeou.** O texto da task (escrito 2026-09-19) diz
*"o TF mais fino escolhido e 5m"* e nomeia o gatilho como *"o dia em que 1m entrar na barra de
TF"*. **Isso já não é verdade hoje:** `1m` está na barra de TF desde a fase `03`
(`T-03.9`/`T-03.11`, mergeadas antes desta task rodar) —
`frontend/src/app/symbol/supported-timeframes.ts:68,78`:
`SUPPORTED_TIMEFRAMES` inclui `{interval: "1m", stepMs: 60_000}` e
`DEFAULT_TIMEFRAME = "1m"` — **`1m` é o TF que a tela mostra no primeiro paint.** Documentar o
gatilho como um evento futuro seria escrever um número que o próprio repositório já contradiz.

**E mesmo assim o mecanismo continua sem caso para disparar — por um motivo mais forte do que o
que a task original deu:** `interval=1m` contra uma série nativa de `5min` (ex. `sum_open_interest`)
não produz ausência. `build_series_history_report`
(`backend/src/modules/sentimento/use_cases/series_history.py:339,374-386`) pede leituras ao `as_of`
na grade nativa de **1 minuto** (`native_instants`), com a política de carry-forward construída sobre
`bucket_interval_ms=entry.native_grid_ms` — ou seja, o valor de `5min` é **repetido a cada minuto**
até `maxStalenessMs` (600.000 ms para `sum_open_interest`, do próprio catálogo). Esse mecanismo
**não é novo**: é o `as_of`/carry-forward que já existia antes desta feature. Resultado: hoje, para
os TFs servidos `{1m, 5m, 15m, 1h, 4h}` (`SUPPORTED_INTERVAL`, `series_history.py:60`), **nenhuma
das quatro métricas nativas de `5min` fica sem leitura só por causa do TF escolhido** — inclusive em
`1m`, que é justamente o caso que motivou a pergunta do owner.

⚠️ **Achado correlato, fora do escopo desta declaração — registrado para não desaparecer:** existe
um segundo mecanismo, **pré-existente e não relacionado a esta feature** (`ADR-026/D1`,
`classify_grid_multiple`, `backend/src/modules/charts/domain/panel_grid_enablement.py`), que
**já** calcula `enabled=False, reason=UPSAMPLING` exatamente quando `panel_grid_ms < native_grid_ms`
— isto é, exatamente para `interval=1m` sobre uma série de `5min`. Esse veredito **já viaja no fio**
(`SeriesHistoryReport.panel_grid`, campo `grid_multiple` do envelope,
`backend/src/modules/sentimento/domain/series_history_report.py:177,204`), mas **nenhum ponto de
`frontend/src` o lê** — `grep -rniE 'grid_multiple|panel_grid|upsampling' frontend/src --include='*.ts' --include='*.tsx'`
→ **`0`** `[MEDIDO 2026-09-23]`. **Isto não é o mesmo mecanismo que o owner pediu**: `UPSAMPLING` é
um veredito sobre a FIDELIDADE do desenho de candle num TF mais fino que a grade nativa (o domínio
de `ADR-026`, ligado ao eixo único da fase `02`), não sobre AUSÊNCIA de leitura — o carry-forward do
parágrafo acima já garante que sempre há valor. Não é escopo de `[M-13]` nem desta task construir
consumo de `grid_multiple` em `web`; fica nomeado aqui para o dia em que alguém precisar decidir se
os dois vereditos (ausência-por-TF e fidelidade-de-upsampling) devem convergir numa única UI.

**Por que a ausência genuína exigiria uma grade mais grossa que `5min`, não a entrada de `1m` na
barra:** o carry-forward cobre qualquer TF servido **enquanto `maxStalenessMs` alcançar o próximo
ponto nativo**. Isso vale para `1min` sobre `5min` (a única lacuna nativa que existe hoje) porque
`600.000 ms ≥ 300.000 ms` (a largura da própria grade). Uma série cuja grade nativa fosse, por
exemplo, `15min` ou `1h` **também** seria coberta pelo mesmo mecanismo em qualquer TF `≥` sua
própria grade — o caso que genuinamente quebra o carry-forward é pedir um TF **mais fino** que uma
grade nativa **mais grossa** que a maior janela de staleness admitida, ou simplesmente uma grade tão
grossa que o produto (design) decida que repetir o mesmo valor por horas deixou de ser uma leitura
honesta. **Por isso o gatilho certo não é "`1m` entra na barra"** (já entrou, e nada quebrou) **— é
"uma grade nativa mais grossa que `5min` entra no catálogo"**, como o dono da decisão (`/architect`
da feature que a introduzir) terá de julgar caso a caso se o carry-forward ainda basta ou se a
ausência passa a ser real.

**Por que não construir agora:** um toggle de indisponibilidade que nunca teria caso positivo para
mostrar é um pixel que nunca acende — e pixel que nunca acende não tem ablação, que é o `DoD-VERTICAL`
que este repositório exige de todo pixel (`D-C3.6`/`DoD-4` da fase `05`; mesma classe do `rc=0`
ambíguo de `ADR-012`: verde indistinguível entre *"nunca disparou"* e *"nunca foi capaz de
disparar"*).

**O gatilho de reabertura, nomeado:** o dia em que uma série entrar no catálogo com grade nativa
mais grossa que `5min` (ex.: um provider cuja menor resolução seja `15m` ou `1h`). Dono: o
`/architect` da feature que introduzir essa grade — não esta.

---

## 12. Rastreabilidade — requisito do `PRD-008` → onde esta SPEC o fecha

| requisito | fecha em | fase |
|---|---|---|
| `RF-1` produtor de preço | §3.1 (laço de 2 → 6 pares) | `01` |
| `RF-2` quatro números por bucket | §3.4 (4 `Reduction`) | `01` |
| `RF-3` corpo e pavio | §9 `P1` + ablação | `01` |
| `RF-4` ausência ≠ zero | §7.2 (`RN-1` aplicado ao eixo do tempo) | `01`, `05` |
| `RF-5` eixo mestre | §6 (delegado, invariante fixado) | `02` |
| `RF-6` barra de TF | §4 (`{1m,5m,15m,1h,4h}`) | `03` |
| `RF-7` uma implementação de reagregação | §4 `B1` + §5 invariante de pureza | `03` |
| `RF-8` rótulo derivado | §8.2 | `04` |
| `RF-9` proveniência rastreável | herdado (`RN-7`) | todas |
| `RNF-3` pegada de disco | §3.6 + DoD da fase `01` | `01` |
| `RNF-4` zero chamada nova | §3.1 (`DoD 7` já pago) | `01` |
| `G-1`/`G-6` (`F5`) | §8.1 — **`F5` fora**, `C1` vigente | — |
| `G-2` (`[Q2]`/`[Q3]`) | respondido pelo owner; §4, §7.1 | `03`, `05` |
| `G-3` (`[Q5]`) | `[M-5]`, não-bloqueante | `02` |
| `G-4` (`[Q6]`) | §8.2 — **consertar agora** | `04` |
| `G-5` (`[Q7]`) | §3.5 — **some junto**, sem bandeira | `01` |

---

## 13. Próximo passo

`advance SPEC_DRAFT` (feito pelo `/architect`) → **`approve spec` é gate do OWNER** → `/tech-lead`.

⛔ Esta SPEC é `DRAFT`. Nenhum agente a marca aprovada. As fases `02` e `03` **não entram em
plano de execução** antes de `[M-3]` e `[M-4]` voltarem.
