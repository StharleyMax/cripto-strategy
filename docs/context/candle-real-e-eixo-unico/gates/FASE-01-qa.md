# Portão de FASE `01` — `candle-real-e-eixo-unico` · QA

> **PR** [#227](https://github.com/stharley/cripto-strategy/pull/227) · ramo `wave/candle-f01` ·
> árvore `9204d1d` · 38 commits, `80 files changed, 16919 insertions(+), 197 deletions(-)`
> `[MEDIDO 2026-09-20: git diff --stat origin/master...wave/candle-f01 | tail -1]`
>
> Este é o portão **por fase** (Corte A, `plano §7`), não por task. O objeto é o conjunto dos
> **8 `DoD`** de [`01_vela.md`](../../../plans/SPEC-008-candle-real-e-eixo-unico/01_vela.md)
> — e o método é **falsificar o ✅**, não conferi-lo.

## ⛔ Veredito: `NEEDS_FIX`

**Um dos oito `DoD` não está fechado** — e ele foi derrubado pelo instrumento **da própria
fase**, rodado por mim hoje. Um segundo esteve em aberto como anomalia e **foi resolvido a
favor da tela** (ver o riscado abaixo):

- **`DoD-9`** — `candle_fidelity_cli` devolve `verdict=rejected`, `rc=1`, em **duas janelas
  disjuntas**, com a **assinatura `[M-9]` que o `DoD` nomeia como MORDE** (§1);
- ~~**`DoD-2` no pixel**~~ — **RESOLVIDO em 2026-09-20T23:xxZ: era o INSTRUMENTO, não a tela.**
  O estimador de escala ancorava em pixels **cortados pelo piso da banda de preço**
  (`192 × 0,8 = 153,6 px`, `VOLUME_SCALE_MARGINS`). Reparado o estimador, **a mesma janela que
  dava `13,77 px` dá `0,56 px`** (teto `3`), mediana `0,26` sobre 45 arestas. A tela desenhava os
  números da API o tempo todo. **`DoD-2` fecha** (§2-bis). ⛔ Zero mudança de produção.

**E o que eu tentei derrubar e NÃO caiu:** a ablação do `DoD-4`. Reproduzi-a sobre **19× mais
dado** e ela morde e cala igual (§2). Os demais `DoD` remedi e passam.

Nada aqui pede que a fase seja refeita. Pede que **um ✅ que não é ✅ pare de ser escrito como
✅** (`DoD-9`), e que dois adiamentos ganhem carregador.

---

## 1. ⛔ `DoD-9` REPROVA — e o veredito não é meu, é do `candle_fidelity_cli` da fase

O `DoD-9` declara o próprio MORDE, literal (`01_vela.md:95-100`):

> **Morde** se `OPEN`/`HIGH`/`LOW`/`CLOSE` armazenados divergirem da kline da Binance além da
> tolerância declarada, **e morde em particular com viés unilateral (`pos=0` em `n` buckets)** —
> isso seria a vela **herdando** `[M-9]`.

Rodei o instrumento da fase contra a origem em **duas janelas de 3 h disjuntas**, hoje:

```bash
# janela A — [1789932606000, 1789943106000)
backend/.venv/bin/python -m src.modules.sentimento.infra.candle_fidelity_cli \
  --symbol BTCUSDT --window-start-ms 1789932592000 --window-end-ms 1789943092000 \
  --knowledge-time-ms <now>        # PYTHON_RC=1
symbol=BTCUSDT verdict=rejected
universe: origin_buckets=175 compared=692 absent=0 carried=4 divergences=76
  OPEN  n=173 pos=0  neg=0  zero=173
  HIGH  n=173 pos=0  neg=8  zero=165
  LOW   n=173 pos=7  neg=0  zero=166
  CLOSE n=173 pos=35 neg=26 zero=112
  ⛔ UNILATERAL BIAS on HIGH: pos=0 neg=8  over n=8  (minimum_n=4) — the `[M-9]` signature, not noise
  ⛔ UNILATERAL BIAS on LOW:  pos=7 neg=0  over n=7  (minimum_n=4) — the `[M-9]` signature, not noise
  writer traces behind the divergences: live_tail

# janela B — [1789918221000, 1789929021000), disjunta da A
  ...                                        # PYTHON_RC=1
symbol=BTCUSDT verdict=rejected
universe: origin_buckets=180 compared=716 absent=0 carried=0 divergences=114
  HIGH  n=179 pos=0  neg=12 zero=167
  LOW   n=179 pos=7  neg=0  zero=172
  ⛔ UNILATERAL BIAS on HIGH: pos=0 neg=12 over n=12 (minimum_n=4)
  ⛔ UNILATERAL BIAS on LOW:  pos=7 neg=0  over n=7  (minimum_n=4)
```

`[MEDIDO 2026-09-20T22:2xZ, n=355 buckets × 4 reduções = 1.408 comparações em 2 janelas
disjuntas; rc do Python = 1 nas duas]`

### O que isto diz, e por que não é a mesma nota de rodapé que o `ESTADO` já carregava

1. **A direção é uma só, e ela tem nome: a vela armazenada é mais ESTREITA que a origem.**
   `HIGH` sempre **abaixo** da origem (`pos=0` em `20` buckets divergentes somando as duas
   janelas), `LOW` sempre **acima** (`neg=0` em `14`). São **34 divergências, 34 no sentido que
   ESTREITA a faixa**. Sob sinal independente e simétrico, a chance de as 20 de `HIGH` e as 14
   de `LOW` saírem todas do lado que fecha a vela é `2·2⁻²⁰ × 2·2⁻¹⁴ ≈ **2,3·10⁻¹⁰**` — não é
   amostra pequena, é assinatura.
2. **O `ESTADO-2026-09-19.md` previu exatamente isto e arquivou como ruído**: *"`HIGH` 3/3
   negativo + `LOW` 1/1 positivo … Separadas não alcançam `minimum_bias_n=4` … Amostra pequena,
   não derruba nada."* Hoje **cada redução sozinha** alcança `minimum_bias_n=4`, em **cada uma**
   das duas janelas, e **o próprio CLI imprime `[M-9] signature`**. A previsão foi testada e
   **confirmou a acusação**, não a dispensou.
3. **Não é o `CLOSE`.** O `CLOSE` continua simétrico (`pos=35/neg=26`, `pos=48/neg=47`) — o
   achado de `T-01.7` segue de pé e segue não sendo `[M-9]`. **O que é novo é `HIGH`/`LOW`**, e
   `HIGH`/`LOW` são literalmente o **pavio**, o pixel que o `P1` desta fase existe para desenhar.
4. **A causa mecânica já está escrita no repositório, em `T-01.7` §3.1**, e explica o sinal sem
   apelar a acaso: o coletor lê a cauda em `bucket_end + 2,0 s`
   (`_DEFAULT_KLINES_CYCLE_OFFSET_S`), os `lag_ms` medidos confirmam (`2.328..2.844 ms`), e a
   `fapi` assenta a barra **~58 s** depois. Ler o extremo antes de ele assentar **só pode**
   truncá-lo: `HIGH` nunca sobe, `LOW` nunca desce. **Viés unilateral não é ruído de mercado — é
   o instrumento lendo cedo.**
5. **Magnitude máxima medida: `-27,80 USDT` sobre `81.263,40`** (`0,034%`,
   `t=1789923060000`). Pequeno em percentual — e irrelevante que seja: `DoD-9` **não** tem
   tolerância de magnitude, tem tolerância **zero** com contagem de sinal, e foi assim que
   `ADR-040`/`[M-9]` pediu.

### ⛔ E o ✅ que o `ESTADO` escreve para o `DoD-9` mede um caminho que a tela NÃO vê

| | o que foi medido | como foi lido | chega à tela? |
|---|---|---|---|
| ✅ *"backfill bate ao centavo (240/240)"* | `bucket_end ∈ (1789732800000, 1789747200000]` | **`psql` direto em `md.series`** (`T-01.5-dod6…:26-33`) | ❌ **não** |
| ⛔ o que a tela mostra | as `1.505` velas servidas agora | `/api/v1/series-history` | ✅ **sim** |

A segunda linha é o próprio achado de lookahead da fase: o acessor recusa a linha do backfill
(`available_at − bucket_end ≈ 33 h`) e **serve só o poll vivo**. Rodado pela API, o universo
declarado do `DoD-9` devolve `verdict=not_measured`, `rc=3`, `compared=0`
(`T-01.7-builder.md:135-139`) — **o assert da quádrupla auto-verificável pelo owner nunca foi
executado pelo caminho servido**. Logo: **o ✅ do `DoD-9` vale para bytes que ninguém vê, e o
caminho que o owner vê é o que o instrumento reprova.**

**Ação.** Não peço o conserto aqui (a causa raiz é `ADR-034`, e o próprio `DoD-9` diz que não a
conserta). Peço as três coisas que o portão exige:

1. **`DoD-9` deixa de ser ✅** no `ESTADO` e na `PR`: vira ⛔ com o número acima. Um `DoD` cujo
   instrumento devolve `rc=1` não é um `DoD` fechado.
2. **Escalar a `/architect` como achado NOVO**, distinto do `CLOSE` de `T-01.7`: *o `HIGH`/`LOW`
   servidos estreitam a faixa, unilateralmente, em `34/34` buckets divergentes de 2 janelas*.
   Candidato de conserto já nomeado pela própria fase: `_DEFAULT_KLINES_CYCLE_OFFSET_S = 2.0`
   contra os `~58 s` de assentamento da `fapi`.
3. **Um falsificador que repita isto sozinho**: hoje o `candle_fidelity_cli` só roda a mão.
   Enquanto rodar a mão, a regressão volta em silêncio.

---

## 2. ✅ `DoD-4` (ablação) — **REPRODUZI, sobre 19× mais dado, e ela morde pelo motivo certo**

Ataquei a ablação procurando um "sumiu" que fosse por acaso — e **rodei o e2e forte eu mesmo**,
contra o deployment do owner, hoje:

```bash
cd frontend && E2E_BASE_URL=http://127.0.0.1:3000 \
  E2E_SENTIMENTO_API_BASE_URL=http://127.0.0.1:8000/api/v1 \
  node_modules/.bin/playwright test --config=playwright.config.ts 15-vela
```

| fato | ontem (`n=80` velas) | **hoje, minha rodada (`n=1.515`)** |
|---|---|---|
| `ablation_before_ink_pixels` | `663` | **`4.466`** em `758` colunas |
| `ablation_after_ink_pixels` | `0` | **`0`** |
| `ablation_after_drawn_candles` | `0` | **`0`** |
| `ablation_rewritten_responses` | `4` | **`4`** (as 4 reduções, nenhuma a mais) |
| `ablation_surviving_columns` | `[]` | **`[]`** ⇐ asserção de POSIÇÃO |
| `placebo_ink_pixels` (ablar OI) | `663` | **`4.466`** — idêntico |
| `placebo_drawn_candles` | `80` | **`1.515`** — idêntico |
| `placebo_same_window` + geometria | `true` / idêntica | **`true` / idêntica** |

`[MEDIDO 2026-09-20T22:4xZ, n=1.515 velas, canvas 1208x192]` — **o universo cresceu 19× e o par
morde/cala não se mexeu.** Isso é o que separa "mordeu" de "mordeu por acaso": ablar o produtor
de preço zera `4.466` px e **as 758 colunas somem sem deixar uma**; ablar OUTRA série deixa os
mesmos `4.466` px, nas mesmas colunas, com o mesmo `top`/`bottom`.

E as três propriedades estruturais que sustentam isso são verificáveis no arquivo:

| propriedade | onde | por que fecha a porta |
|---|---|---|
| a tinta medida é **só** da vela | `15-vela-e-ablacao.spec.ts:94-107`, `color-tokens.ts:244-247` | `#089981`/`#f23645` não aparecem em nenhum outro consumidor de `frontend/src` `[MEDIDO: grep dos dois hexes fora de `color-tokens` → só `globals.css` (CSS, não `<canvas>`) e testes]` |
| a ablação é **cirúrgica** | `:590-596` | reescreve só `/series-history` **daquele `metric`**; as demais séries passam verbatim, e `rewrittenResponses()` é assertado `== 4` |
| o "sumiu" não é "quebrou" | `:879` + `:899-902` | a tela **continua publicando** `data-price-candles=0` (painel vivo, declarando ausência) **e** o placebo (ablar `sum_open_interest`) mantém a tinta e a **geometria byte a byte** |

⛔ **Mas o `DoD-4` não roda no portão.** Sob `make verify`/`make e2e` a API é sqlite efêmera,
`/series-history` responde `500`, `candles_full=0` e o teste chama
`test.skip(…, "universo FRACO")` (`:707` e `:832`). O ✅ do `DoD-4` vem de **uma execução manual
de ontem** contra o deployment do owner. Isso está **declarado** no laudo `T-01.11` (§*Universo
FRACO*) — não é ocultação —, e mesmo assim é uma propriedade ruim de portão: **o portão mais
forte da fase é o único que o portão não executa.**

Confirmei com a minha própria rodada: `41 passed`, e as linhas `42` (`CA-2` forte) e `43`
(`CA-4`) saem **`-` (skipped)**, com `candles_full=0` e `series_history_status=500`
`[MEDIDO 2026-09-20, /tmp/verify-cripto-strategy-20260920T222720Z.log:2254-2256]`.

**Ação.** Registrar, no plano ou numa task, que `DoD-4` é **medição manual com comando literal**
e que a rodada tem de ser **repetida a cada mudança de produção que toque o painel de Preço**
(`Revalidar gate após mudança de produção`). Não bloqueia a fase — mas a fase não deve fechar
achando que `make verify` cobre isso.

---

## 2-bis. ✅ RESOLVIDO — `CA-2` no pixel: **o veredito é INSTRUMENTO, e a tela está certa a `0,56 px`**

> **Atualização de 2026-09-20T23:xxZ.** No laudo anterior isto era **anomalia declarada** — eu
> tinha localizado a aresta e derrubado duas hipóteses, sem decidir entre **tela** e
> **instrumento**. Decidido: **é o instrumento**, e a prova é que o instrumento reparado
> **aprova a MESMA janela que reprovava**, com os MESMOS pixels.

### O que a reprovação era

```
Error: as arestas desenhadas não são as quatro leituras da API — a tela está desenhando outra coisa
Expected: <= 3          Received: 13.772269558480218
alignment_worst_edge="wickBottom/low@3"     alignment_first_candle_time=1789938060000
```

`13,77 px` em **3 rodadas consecutivas**, sempre na mesma janela de 12 velas
(`1789938060000`..`1789938720000`). Não era flutuação: era determinístico **enquanto aquela
fatia estava na tela**. Em `8` rodadas posteriores, com a fatia já rolada, deu `0,77` — `8/8`.

### A causa, em três medições

**1 · O erro não estava na vela 3 — estava na ÂNCORA.** Reconstruí a janela fora do browser
(pixels do log × `/api/v1/series-history` dos 12 buckets) e ajustei a **mesma** reta por
**mínimos quadrados** sobre as 48 arestas, em vez de ancorar nos 2 extremos:

| estimador | erro máx | onde | mediana dos 48 |
|---|---|---|---|
| **2 pontos** (o que reprovou) | `13,77 px` | `wickBottom/low@`**`3`** | — |
| **mínimos quadrados** | `13,37 px` | `wickBottom/low@`**`11`** | **`0,84 px`** |

**47 das 48 arestas dentro de `3,3 px`, mediana `0,84 px`** — e o outlier **muda de vela**. Isso
mata a hipótese "a vela 3 está errada": a vela 3 estava sendo **acusada por um erro que não era
dela**.

**2 · O alinhamento estava CERTO** — não era offset trocado. Refiz a busca de offset com o
critério robusto sobre `70` janelas consecutivas candidatas:

```
maxres_px     first_time        pior aresta  i mediana   px/USDT
    13.37  1789938060000     wickBottom/low 11    0.84   -0.1729   <= o que o teste escolheu
    29.19  1789938000000     wickBottom/low  3    9.05   -0.1628
```

O offset escolhido ganha do segundo colocado por `13,37` contra `29,19` (mediana `0,84` contra
`9,05`). **A pergunta "quais 12 buckets" estava respondida certo.**

**3 · ⛔ E o outlier que sobrou é um PIXEL QUE NÃO PODE EXISTIR — a banda de preço acaba antes.**
O `<canvas>` do painel carrega duas escalas: a do preço e a do sub-eixo de volume, que ocupa a
faixa de baixo — `VOLUME_SCALE_MARGINS = { top: 0.8, bottom: 0 }`
(`frontend/src/app/symbol/SymbolClient.tsx:556`). Em `192 px` de painel:

```
piso da banda de preço = 192 × 0,8 = 153,6 px
arestas medidas EM CIMA do piso (y >= 152,6): 3 de 48
  wickBottom/low@3  y=153     wickBottom/low@11 y=154     bodyBottom/min@11 y=154
```

**Um pavio cujo preço cai abaixo de `153,6 px` não tem onde ser desenhado.** O estimador antigo
mapeava `min(y)`→`max(preço)` e `max(y)`→`min(preço)` — ou seja, **elegia justamente esses
pixels cortados como âncoras**. Âncora reporta erro `0,00` para si mesma e transfere a distorção
para o meio do trecho. Daí a forma do resíduo que eu tinha medido e não sabia ler: **zero nas
duas pontas, máximo no meio, sempre o mesmo sinal** (`0,87 · 2,43 · 8,67 · **13,77** · 9,42 ·
7,49 · 7,00 · 5,23 · 6,27 · 9,50 · 12,51 · 0,00`). Isso nunca foi um defeito de dado — é a
assinatura geométrica de uma reta presa em dois pontos errados.

### A prova de fechamento: o instrumento reparado APROVA a janela que reprovava

Mesmos pixels, mesmos números da API, excluídas as 3 arestas que encostam no piso da banda:

```
erro MÁXIMO = 0.56 px  na aresta wickTop/high@2       (teto do teste: 3 px)
mediana = 0.26 px sobre as 45 arestas restantes       VEREDITO: PASSA
```

`[MEDIDO 2026-09-20, n=48 arestas da janela 1789938060000, script
scratchpad/qa_realign.py sobre os pixels de `qa-e2e-forte4.log`]`

⇒ **A tela desenhava as quatro leituras da API com erro máximo de `0,56 px` o tempo todo.** O
`13,77 px` era inteiramente fabricado pelo estimador. ⛔ **Nenhuma mudança de produção é
necessária, e eu não fiz nenhuma.**

### O reparo, e ele é só teste

`frontend/e2e/15-vela-e-ablacao.spec.ts`:

1. **`bestAlignmentError` passa a ajustar a escala por mínimos quadrados sobre as `4m` arestas**,
   não por dois extremos. Toda aresta pesa igual ⇒ **o outlier aparece onde ele está**, em vez de
   virar âncora e acusar o vizinho.
2. **Arestas em cima do piso da banda de preço são excluídas e CONTADAS** (`alignment_clipped_edges`),
   porque medir ali mede a parede, não o número.
3. **`CA-0`, novo teste: a guarda contra deriva da constante.** `PRICE_BAND_BOTTOM_FRACTION = 0.8`
   é cópia de produção e não é exportada; o teste **lê `SymbolClient.tsx`** e reprova se
   `VOLUME_SCALE_MARGINS` mudar. Sem isso a cópia ficaria órfã e o `CA-2` passaria a excluir a
   faixa errada **em silêncio** — que é a classe de quebra que este repositório mais teme.
4. **O falsificador continua mordendo:** `mutated_alignment_max_error_px = 8,52 > 3`.

Rodada contra o app real depois do reparo: **`4 passed`**, `alignment_max_error_px=0,56`,
`alignment_clipped_edges=0`, `aligned_groups=12`.

⇒ **`DoD-2` fecha no pixel também.**


## 3. ⚠️ `DoD-1` passou — por decurso de relógio, sobre o dado que o `DoD-9` reprova

```bash
# 4 chaves klines_ohlc/BTCUSDT, janela e knowledge_time LIDOS DA PRÓPRIA PÁGINA
#   (data-window-start-ms=1789597200000, data-window-end-ms-inclusive=1789942740000)
OPEN  rows=5760  non_null=1505
HIGH  rows=5760  non_null=1505
LOW   rows=5760  non_null=1505
CLOSE rows=5760  non_null=1505
candles_full=1505  high_gt_low=1505  open_ne_close=1476
min_non_null_per_key=1505  target=500
ohlc_invariant_violations=0     # high>=max(open,close) e low<=min(open,close)
```

`[MEDIDO 2026-09-20T22:2xZ, n=4 chaves × 5.760 slots; script em
scratchpad/qa_dod1.py, que recomputa `series_key_id` pelos 15 termos do catálogo]`

**`DoD-1` ✅ — `1.505 ≥ 500` nas 4 chaves.** E três ressalvas que o portão precisa carregar:

1. **A causa do ✅ é o relógio, não a entrega.** Ontem eram `124`; hoje são `1.505`, ~1 ponto por
   minuto de poll vivo. O **backfill de 90 dias** — `2.148.504` linhas, **1,64 GB** pagos e
   medidos no `DoD-6` — **continua invisível** para a tela. O `DoD-1` teria fechado sozinho sem
   ele.
2. **⇒ o dado que paga `DoD-1`, `DoD-2`, `DoD-3` e `DoD-4` é, inteiro, o do poll vivo** — o mesmo
   que o `DoD-9` reprova acima. A pergunta do despacho (*"um `DoD` satisfeito por dado com
   defeito declarado conta como satisfeito?"*) tem resposta separável: `DoD-1/2/3` são de
   **contagem, faixa e ausência** e são verdadeiros sobre esse dado (medi); `DoD-9` é de
   **fidelidade** e é falso sobre esse dado (medi). **Não há contradição — há um `DoD` que
   reprovou e está escrito como aprovado.**
3. `open != close` em `1.476/1.505` (`29` dojis) e `high > low` em `1.505/1.505` ⇒ **`DoD-2` ✅**,
   remedido por mim, sem degenerada e sem colapso dos quatro `STOCK` (`ADR-040/D2`).

---

## 4. ⚠️ O achado do lookahead: **não está escondido — está sem CARREGADOR**

O despacho pediu para confirmar que a fase não esconde o problema. **Ela não esconde**: está
escrito em duas páginas, com falsificador e dono nomeado (`gates/T-01.5-dod6-medicao-e-achado-lookahead.md`,
`ESTADO-2026-09-19.md`), e a leitura técnica é **correta** — `R-1` é `available_at <= t` com `t` =
a fatia, servir a linha de 33 h depois **seria** lookahead, e o acessor está certo.

⛔ **O que falta é o carregador.** O achado **não existe** fora daquelas duas páginas de prosa:

```bash
grep -rn "modos de leitura|knowledge_time|available_at|anti-lookahead" \
  docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md \
  docs/specs/SPEC-008-candle-real-e-eixo-unico.md \
  docs/context/candle-real-e-eixo-unico/tasks.toml
# → nenhuma linha sobre os DOIS MODOS DE LEITURA em 05_historia_sob_demanda.md,
#   nenhuma em SPEC-008, nenhuma task em tasks.toml
```

`[MEDIDO 2026-09-20, n=3 arquivos]` — e a consequência é concreta, não formal: o plano da fase
`05` promete *"história sob demanda"* **paginando pelo acessor que o achado acabou de mostrar que
não serve a história**. Construída como está escrita hoje, a fase `05` entrega paginação sobre
`SEM_PONTO`. *"Cai na fase 05"* dito só em prosa de `ESTADO` é um adiamento que ninguém vai
encontrar quando a fase 05 começar.

**Ação.** Uma linha no plano `05_historia_sob_demanda.md` (ou uma task em `tasks.toml`) apontando
para o laudo do achado, **antes** de a fase `05` ser planejada em cima da premissa falsa. Sem
reabrir a decisão — ela é de `/architect` + `ADR-006`/`SPEC-001` §2.5, como o `ESTADO` diz.

---

## 5. ⚠️ A ablação literal de `color-tokens.test.ts:177-218` é vazia por construção — **PROVADO**

O `ESTADO` listou como aberto (*"mesma classe de fraqueza, outro arquivo"*). Deixou de ser
suspeita:

```bash
node scratchpad/a3-vacuity.mjs      # reproduz A3 com a substituição LITERAL
antes = 3  depois da ablacao = 3
A3 passaria? true
```

`[MEDIDO 2026-09-20]` — o estilo de entrada é **hue-only por construção** (alta `#00aa55`, baixa
`#dd3344`, doji cinza: direção viajando **só** por matiz, o `[BLOCKER-1]` original) e **A3
aprova**. Motivo: a ablação é `/089981/gi` e `/f23645/gi`, **dois literais**, não os tokens. Se
`directionUpFill`/`directionDownFill` mudarem de grafia, a substituição vira **identidade** e o
guarda passa a aprovar exatamente o que existe para reprovar — e o controle negativo
(`:208-217`) **não salva**, porque ele também carrega os literais antigos.

**Ação (só teste, sem produção).** Derivar o cinza de `colorTokens().directionUpFill` /
`.directionDownFill` e construir o controle legado dos **mesmos** tokens, para que trocar o token
**não possa** desligar a medição. Não bloqueia a fase — é a mesma classe do `[SERIOUS-1]` que a
fase já corrigiu no arquivo vizinho.

---

## 6. Os `DoD` que remedi e passam

| `DoD` | veredito | evidência minha |
|---|---|---|
| **1** · ≥500 pontos/chave | ✅ | `1.505` nas 4, `min_non_null_per_key=1505` (§3) — **com as 3 ressalvas** |
| **2** · a vela tem faixa | ✅ **inteiro** | **no DADO**: `high_gt_low=1505/1505`, `open_ne_close=1476/1505`, `ohlc_invariant_violations=0`. **No PIXEL**: `alignment_max_error_px=0,56` contra teto `3`, `clipped_edges=0`, falsificador da mutação em `8,52` (§2-bis) |
| **3** · leitura não-ausente | ✅ | `curl -s http://127.0.0.1:3000/symbol \| grep -o 'data-fact="price_last_reading:[^"]*"'` → `price_last_reading:exact`; e `price_candles:1505/5760` **bate** com o `1505` da API |
| **4** · ablação de pixel | ✅ **reproduzido** | rodado por mim contra o app real, `n=1.515` (19× o universo de ontem): `4.466 px → 0`, `surviving_columns=[]`, placebo `4.466` e geometria idêntica (§2) |
| **5** · zero chamada nova | ✅ | `n_rows=34542` para `n_returned=5761` numa rodada de `n_calls=4` (`T-01.5-builder.md:198`) ⇒ **6 linhas por kline de UMA resposta**. As `348` chamadas do backfill são o item `1.6`, autorizado — não são chamada por bucket |
| **6** · pegada de disco | ✅ `[DOC]` | `+1,641 GB` por `hypertable_size`, demonstrado 3× pela fase. ⚠️ **não reverifiquei**: `docker exec … psql` foi **negado** nesta sessão (`Production Reads`) |
| **7** · degenerada não existe | ✅ | o `grep` **literal** do `DoD` devolve **7**, não `0`; em **produção** devolve **`0`** — as 2 subtrações (`*.test.ts`, linha de comentário) estão **declaradas e nomeadas** em `price-candle.test.ts:261-291`, com o arquivo e a linha da única ocorrência de teste (`canonical-grid.test.ts:51`). O número literal fica registrado aqui para não virar ✅ sem asterisco |
| **8** · `make verify` verde | ⚠️ ver abaixo | |
| **9** · vela contra a origem | ⛔ **FAIL** | §1 |

### `DoD-8` — `make verify` ✅, rodado por mim, com `__pycache__` purgado antes

`116` diretórios `__pycache__` removidos **antes** de acreditar (`CA-12`). `bash scripts/verify.sh`,
carimbo `20260920T222720Z`:

```
[OK] lint-backend    rc=0  461 source files
[OK] lint-frontend   rc=0  ESLint + tsc --noEmit --strict
[OK] test-frontend   rc=0  757 pass, 0 fail em 4 suítes
[OK] test            rc=0  2623 passed · Total coverage: 96.33%
[OK] boundaries      rc=0  7 kept, 0 broken
[OK] regras          rc=0  0 bloqueio(s), 73 aviso(s)
[OK] política        rc=0
[OK] e2e             rc=0  41 passed (44.4s)
veredito: VERDE — 8 portões mediram e passaram        # rc=0
```

`[MEDIDO 2026-09-20T22:27→22:38Z, log bruto /tmp/verify-cripto-strategy-20260920T222720Z.log:1774-1775,
2259]` — **cobertura `96,33%` sobre piso declarado de `70,0%`**, `2.623` testes (a fase reportava
`2.571 / 96,24%`; subiu, não caiu).

> ⚠️ **Anomalia de AMBIENTE na PRIMEIRA rodada, e ela foi RESOLVIDA, não contornada:** havia
> **outros `make verify` em paralelo** na mesma árvore (`pid 1143809` + `pytest 1145661`), **dois
> `pytest` gravando o mesmo `coverage.xml`**, e meu arquivo de resumo no scratchpad foi
> sobrescrito por outro agente que escolheu o mesmo nome. **Refiz sozinho, sobre a árvore já
> commitada com a minha mudança de teste, com `__pycache__` purgado de novo e SEM concorrente**
> (`pgrep -f 'bash scripts/verify.sh'` = `1`):
>
> ```
> === verify · cripto-strategy · 20260920T224651Z (UTC) ===
> [OK] lint-backend rc=0 · lint-frontend rc=0 · test-frontend rc=0  757 pass
> [OK] test         rc=0  2623 passed · Total coverage: 96.33%
> [OK] boundaries   rc=0  7 kept, 0 broken
> [OK] regras       rc=0  0 bloqueio(s), 73 aviso(s)
> [OK] política     rc=0
> [OK] e2e          rc=0  41 passed (42.4s)
> veredito: VERDE — 8 portões mediram e passaram        # rc=0
> ```
>
> **Os dois números batem entre as duas rodadas** (`2623` / `96,33%`), o que é a evidência de que
> a contenção não os moveu — e a segunda rodada é a que vale, porque é a única isolada.

---

## 7. Regras bloqueantes — `8 de 8` avaliadas

`harness rules list --severity block` → **8** regras em vigor (packs `core` + `web-fullstack` +
`own`). O varredor que as aplica é o portão `regras` de `make verify`, comando literal:

```
########## regras :: bash .harness/mechanism rules --mode sweep --surface git-hook ##########
[OK       ] regras          rc=0  0 bloqueio(s), 73 aviso(s)
```

`[MEDIDO 2026-09-20T22:27Z, minha rodada, árvore 9204d1d; log bruto
/tmp/verify-cripto-strategy-20260920T222720Z.log:1812]` — os `73` avisos são todos
`core.module-docstring-single-line`, severidade `warn`, **preexistentes e fora desta fase**.

| regra | veredito | evidência |
|---|---|---|
| `core.relative-import` | OK | sweep acima — `0 bloqueio(s)` |
| `core.silent-except` | OK | idem |
| `core.print-statement` | OK | idem |
| `core.hardcoded-secret` | OK | idem |
| `web-fullstack.browser-imports-server` | OK | idem |
| `web-fullstack.tenant-from-request` | OK | idem |
| `web-fullstack.server-test-directory-present` | OK | idem; e `backend/tests/` presente, `lint-backend rc=0` sobre `461` arquivos |
| `own.compose-hardcoded-secret` | OK | idem |

`[P-seed]` **respeitado por construção nesta rodada**: nenhum `INSERT`, nenhum `psql`, nenhum
`docker exec` — tudo o que medi saiu de `GET` na API, de `curl` na página e do CLI de fidelidade,
que só lê. A vela `1.505` é dado real do owner, não semente minha.

---

## Veredito e ações

**`NEEDS_FIX`** — resta **um** bloqueio, o item `1` (`DoD-9`). O item `2` era meu e **está
fechado**; os demais podem ser fechados no mesmo ciclo.

1. ⛔ **`DoD-9` volta a ⛔** no `ESTADO` e na descrição da `PR #227`, com o número medido
   (`verdict=rejected`, `rc=1`, `HIGH pos=0/neg=20`, `LOW pos=7/neg=0`, `n=34` buckets
   divergentes unilaterais em 2 janelas disjuntas). **Escalar a `/architect`** como achado NOVO
   (estreitamento de faixa no `HIGH`/`LOW` servidos), com o candidato já nomeado pela fase:
   `_DEFAULT_KLINES_CYCLE_OFFSET_S = 2,0 s` contra `~58 s` de assentamento da `fapi`.
2. ✅ **Feito por mim:** a anomalia do `CA-2` foi resolvida — **instrumento**, não tela. O
   estimador de escala foi reparado, a guarda `CA-0` contra deriva da constante de produção foi
   escrita, e a janela que reprovava **passa a `0,56 px`**. **`DoD-2` fechado.**
3. ⚠️ **Carregar o achado do lookahead** para `05_historia_sob_demanda.md` ou para `tasks.toml`
   — a fase `05` está planejada sobre a premissa que ele falsifica.
4. ✅ **Feito por mim:** `make verify` de fechamento em execução **isolada**, sobre a árvore já
   commitada — `VERDE`, 8 portões, `2623 passed · 96,33%`, `e2e 41 passed`.
5. ⚠️ **`DoD-4`**: registrar que é medição manual, com o comando literal, repetível a cada
   mudança de produção que toque o painel de Preço — `make verify` **não** o executa.
6. ⚠️ **Teste**: `color-tokens.test.ts` A3 deriva o cinza dos tokens, não de dois literais
   (vacuidade provada em §5).

### O que eu mesmo mexi, e o limite que respeitei

**Só arquivo de teste, e um só:** `frontend/e2e/15-vela-e-ablacao.spec.ts`.

1. a **parada do zoom** passou a estabelecer a pré-condição do próprio assert;
2. `dropMergedGroups` — hipótese testada e **descartada com medição**, mantida porque a premissa
   que ela remove era inválida de todo jeito;
3. o **rótulo de aresta**, que transformou *"13,77 px"* em *"o `low` de uma vela"* e permitiu
   achar a causa;
4. **`bestAlignmentError` por mínimos quadrados**, com exclusão contada das arestas no piso da
   banda de preço — o reparo que fechou a anomalia;
5. **`CA-0`**, teste novo: guarda de deriva de `VOLUME_SCALE_MARGINS`, lendo `SymbolClient.tsx`.

⛔ **Zero linha de produção.** A única leitura que fiz em `frontend/src` foi `grep` de
`VOLUME_SCALE_MARGINS`, e o valor entrou no teste **com guarda**, não copiado a seco.

---

*QA · 2026-09-20T22:3xZ · árvore `9204d1d` · `PR #227`. ⛔ Nenhum `gate-record` gravado por mim:
o ledger é ato do orquestrador. ⛔ Nenhum arquivo de produção tocado.*
