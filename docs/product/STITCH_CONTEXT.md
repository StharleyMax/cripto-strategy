# STITCH_CONTEXT.md — cripto-strategy

**Data:** 2026-08-25 (**3ª** revisão do dia — as 8 condições do gate `ux-ui-mastery` fechadas) · **Projeto Stitch:** `projects/9264019151773162472` ("crypto", `TEXT_TO_UI_PRO`, PRIVATE)
**Telas no Stitch hoje:** **0** `[MEDIDO: list_screens → {}]` · **Design systems:** 0
**Mantido por:** `/design` · **Lido por:** quem for implementar UI, **antes** de escrever `.tsx`
**Modelo do Stitch:** **`GEMINI_3_1_PRO`** em toda geração e edição `[PREMISSA-OWNER: 2026-08-25]` · **`deviceType: DESKTOP`**

> **Por que este arquivo existe: o Stitch não tem memória.** Cada conversa começa do zero, e por isso o
> design oscila — o modelo renegocia navegação, paleta e escopo a cada prompt. Este documento é o estado
> persistido, e a **§9** é o que se cola no Stitch para que a iteração continue em vez de recomeçar.

---

## 1. Visão geral do produto

**Plataforma pessoal, single-user, de análise quantitativa de cripto-derivativos.** Confirmação cruzada de
três camadas — **estrutura de preço** (pivôs, Fibonacci, volume) · **sentimento e derivativos** (Open
Interest, Funding, Long/Short) · **order flow** (CVD) — em prazos operacionais de **15m / 1h / 4h**, com
decisão **no fechamento do bucket**.

**Não é HFT.** Não há leitura de milissegundo de livro, e **nenhum tick chega ao browser**.

**O problema que a plataforma resolve não é "mostrar gráfico".** É impedir que um número **sem procedência**
chegue a uma decisão que gasta capital. Três modos de falha, e cada um é contrato: **lookahead** ·
**número sem procedência** · **lacuna preenchida em silêncio**.

### Fase atual — e o que ela NÃO é

A fase é **plataforma e dados**. São **non-goals explícitos**: detectores SMC · detectores de pivô e níveis
de Fibonacci · limiar de sinal · matriz de convergência · regra de entrada/SL/TP · métricas de performance
· walk-forward · paper trading · **execução de ordem**.

⚠️ **Isto tem consequência direta no design: a tela NÃO mostra sinal, NÃO mostra "compra/venda", NÃO tem
score de confluência e NÃO tem placar de performance.** Uma tela que mostre qualquer dessas coisas está
fora de escopo, por mais natural que pareça num produto de trading.

---

## 2. Estrutura do sistema

### Vocabulário obrigatório da interface

| termo | o que é | erro a evitar |
|---|---|---|
| **`SeriesKey`** | identidade de série com **15 termos** | não existe "o OI". Existe `OI · grade 5m · BTC · bn-dump · reduction=CLOSE` |
| **selo** | os 4 campos que acompanham todo numeral | série · idade · procedência · completude |
| **procedência** | `OBSERVADO` · `DERIVADO` · `MODELADO` · `HUMANO` | `DERIVADO` **não é** `MODELADO` |
| **`available_at`** | o mais cedo em que um consumidor ao vivo poderia saber | é o que gera a **idade**; não confundir com `event_time` |
| **`COMO EM T`** | modo de leitura point-in-time | oposto de `AO VIVO`. Ver §7 |
| **`bundle`** | o conjunto de parâmetros versionado e hasheável — **ele É a URL** | **não é um CRUD de presets** |
| **quarentena** | série com `label_shift`, `unit` ou `available_at` nulos | **não sincroniza painel** |

### Fronteira de componente (afeta o que pode viver em cada tela)

`charts` transforma série tipada em **geometria** — não faz I/O, não conhece rota nem sessão.
`web` transforma intenção em **leitura tipada** — não calcula geometria, nenhum `px`.

---

## 3. Mapa de navegação

**Desktop-first.** Operação de **um só usuário**, em VPS exposta, com **auth mínima single-user**.

```
shell autenticado
├── S2  símbolo            ← NÚCLEO OPERACIONAL. multi-painel, replay as-of, marcação
├── S1  console de coleta   o que está sendo gravado, o que parou, quanto é perda permanente
├── S3  inspetor de série   o que este número é, e quais linhas exatas o produziram
└── S4  bancada             que taxa de disparo um limiar produziria — ANTES de escolher o limiar
```

**`S5` NÃO é tela.** É `universe_at(ts, filtro)` atrás de **todo** seletor de símbolo.

**Chrome global, sempre visível:** chip de `env ∈ {mainnet, testnet, demo, replay}` · modo
`AO VIVO`/`COMO EM T` · versão do bundle · fuso.

---

## 4. Inventário detalhado das telas

### 4.1 S2 — símbolo · **NÚCLEO OPERACIONAL** · `[NÃO EXISTE NO STITCH AINDA]`

**Job:** *olhar uma série contra o preço e afirmar o que ela significa.*

**S2-mínima é a primeira fatia de valor visível** (fase `05`), e a honestidade sobre que valor é este está
escrita: é valor **de verificação**, não operacional. **Não mostra o mercado agora** — o painel de OI vem
do dump com **~30,3 h de idade** e cobre 4 dias **com um buraco real**.

| conteúdo da S2-mínima | |
|---|---|
| símbolo | 1 (BTCUSDT), 4 dias |
| painéis | **Preço** · **OI** · **CVD delta** · **CVD acumulado** |
| painel de Preço | declara **`price_source` E `price_use`** na linha do painel |
| selo | 4 campos, **visível sem hover** |
| içamento | 3 níveis (sessão / painel / número) |
| `knowledge_time` | **na URL** |
| `pointer_mode` | `read` / `annotate`, overlay acima do plot e abaixo do crosshair |
| atribuição | notice do `NOTICE` + **TradingView** creditada com link |

**Não faz:** zero algoritmo, zero limiar, zero "sinal". A caixa que o owner desenha é **entrada** da fase
seguinte, não saída desta.

### 4.2 S1 — console de coleta e retenção · `[NÃO EXISTE]` · fase `07`

**Job:** *o que está sendo gravado, o que parou, quanto disso é perda permanente.*
**⚠️ S1 NÃO é canal de alarme.** É onde se **diagnostica depois de ser avisado** — "coletor parado" é P1
com orçamento de 24 h e **não pode depender de uma aba aberta**.

### 4.3 S3 — inspetor de série · `[NÃO EXISTE]` · fase `06`

**Job:** *o que este número é, e quais linhas exatas o produziram.* Inclui a **gaveta de quarentena**.

### 4.4 S4 — bancada de distribuição · `[NÃO EXISTE]` · fase `08`

**Job:** *que taxa de disparo um limiar produziria — antes de escolher o limiar.*
**Sem botão com verbo por linha** — a superfície não age. E **nenhum nudge** para baixar o limiar.

---

## 5. Design system

Fonte única: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) · decisão em [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md).
Comando de verificação: `node scripts/validate_palette.js` — **361 medições, exit 0, nos dois modos, sob
as TRÊS dicromacias.** Estimador: **Brettel 1997**, planos derivados em execução.

> ### ⛔ MUDANÇA ESTRUTURAL de 2026-08-25 (2ª revisão)
>
> ~~"Vermelho significa 'o dado quebrou', não 'o preço caiu'. Vela de baixa não é vermelha."~~
> **REVOGADO.** O owner declarou que usa TradingView todo dia e que a ausência de vermelho ficou
> "super estranha" — o que **realiza o falsificador que a auditoria já havia nomeado** (Jakob's Law
> morde quando os dois monitores ficam lado a lado). Ver `DESIGN_SYSTEM.md` §0.
>
> **O novo eixo é o TIPO DE MARCA**, não o significado. E a medição fechou o caso por um segundo
> caminho: o par da TradingView `#089981 ↔ #f23645` mede **18,0** sob `min(protan, deutan, tritan)` e
> **PASSA** — o verde/vermelho *genérico* mede 12,2 e é WARN. **Não havia trade-off a pagar.**
> *(Tarja: a 2ª revisão publicou `18,2` sob Viénot 1999; sob Brettel 1997 é `18,0`. Veredito idêntico.)*
>
> ### ⛔ SEGUNDA MUDANÇA ESTRUTURAL, de 2026-08-25 (3ª revisão)
>
> **Tritanopia foi MEDIDA e REPROVOU o violeta.** `--dado-quebrado-ink` mudou nos **dois** modos:
> ~~`#6d28d9`~~ → **`#581c87`** (claro) e ~~`#c084fc`~~ → **`#e0aaff`** (escuro). O par
> `dado-quebrado × proc-fraca` media **5,3** em tritan no claro — abaixo até do piso de WARN. Ver
> `DESIGN_SYSTEM.md` §1.4-bis e [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md).

O que **nenhum** prompt de Stitch pode contrariar:

1. **Direção de preço é verde/vermelho da TradingView, e vive SÓ em preenchimento de forma.**
   Nenhum numeral, rótulo, sinal de delta ou texto é tingido de verde ou vermelho. **Não existe token
   de texto de direção** — a guarda é a ausência do token, não uma regra a lembrar.
2. **Redundância de forma obrigatória, com TRÊS estados:** corpo **vazado** = `close > open`, corpo
   **cheio** = `close < open`, **cruz** = `close == open` ⇒ **direção não afirmada**. Medido: a razão de
   luminância entre os dois fills é **1,09** ⇒ em escala de cinza são a mesma cor, e **nenhum** par de
   hue resolve isso (o azul/laranja anterior colapsava igual, em 1,38). **Não force altura mínima de
   corpo** — ver `DESIGN_SYSTEM.md` §1.9.
3. **"Dado quebrado" é VIOLETA** — `#581c87` claro / `#e0aaff` escuro — e o violeta é o **terceiro**
   canal: **losango vazado** + **palavra** + cor. Nunca vermelho, nunca preenche área, **nunca tinge
   numeral**. ⚠️ **Os valores anteriores (`#6d28d9` / `#c084fc`) REPROVAVAM sob tritanopia** (5,3 e 14,7).
4. **Só três hues existem na interface:** verde-teal, vermelho, violeta. **Ação e procedência vivem no
   canal de luminância** — ação **não é azul**, porque azul × violeta mede **0,3** sob deuteranopia.
5. **O numeral tem UM eixo de tinta**, o de procedência, e ele **não tem hue**. O sinal de um delta é
   lido pelo caractere `+`/`−` em coluna tabular fixa, pela geometria do plot, e opcionalmente por
   mini-barra (que é forma).
6. **ALERTA E SEVERIDADE FICAM FORA DO CANAL DE COR** (`CA-F4-10`), e **a regra é genérica** — vale para
   toda afirmação de estado grave, **não só** para integridade de dado. `coletor PAROU` (`S1`) é
   **severidade operacional**, não integridade, e **não herda o violeta**: vive em palavra + glifo +
   posição + contagem. Quatro argumentos independentes: escassez de canal · `forced-colors` (e a
   premissa dele **estava invertida** — item 10) · contraste medido · **tritanopia, agora MEDIDA e que
   reprovou** o violeta na primeira posição em que ele foi posto.
7. **4 papéis mutuamente exclusivos**: direção · integridade · procedência · marca. Não cruzam. E
   **severidade não é um quinto papel de cor** — é um papel **sem** cor.
8. **Nenhum numeral sem selo, visível sem hover. Tooltip não conta.**
9. Numeral com **ponto decimal, invariante de locale**; pt-BR só em microcopy e rótulo de eixo.
10. **`forced-colors` (HCM do Windows) trata as duas metades da tela de forma OPOSTA:** sobrescreve o
    chrome (CSS) e **não** afeta o plot (`<canvas>`) ⇒ **híbrido descasado**, não degradação graciosa.
    Toda cor do plot tem de poder **chegar como argumento** (`FR-1`, `ADR-003:36`). `[NÃO SEI]` se o
    owner usa Windows/HCM — é uma pergunta de uma linha e está aberta.
11. **O anel de foco é DESLOCADO** (`outline-offset > 0`), e isso é **requisito de acessibilidade**:
    `--foco` é **byte-idêntico** ao token que ele encosta (contraste **1,00**). Com o vão de superfície
    o pior caso é **4,89**; colado, **reprova**.
12. **Os dois modos são validados.** O modo de geração é **ESCURO** (`#131722` / `#0d1017` /
    `#222634`) — é o default da TradingView, e o `--dado-quebrado` mede **8,15** no escuro contra
    **9,54** no claro. O ramp claro existe, passa, e **não** é o que se gera.

Os valores exatos vivem **só** em [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) §1.2 e no §9 deste arquivo —
repeti-los em terceiro lugar **já produziu divergência** entre documentos uma vez.

---

## 6. Jornada do usuário

```
1. abre S2 num símbolo          → escolhe janela e TF; o seletor passa por universe_at
2. lê preço + OI + CVD juntos   → cada painel declara sua própria identidade e idade
3. desconfia de um número       → vai à S3 e vê as linhas exatas que o produziram
4. volta e MARCA um swing       → a marcação amarra à série de preço usada, não ao símbolo
5. quer saber se um limiar vale → S4 mostra a distribuição ANTES de ele escolher
6. quer reproduzir o que viu    → bundle_hash + window + knowledge_time. A URL basta
7. algo parou de ser gravado    → é AVISADO fora do browser, e diagnostica na S1
```

O passo 7 tem um buraco declarado: **o canal de aviso não existe** (`Q3`).

---

## 7. Decisões de UX já tomadas — **imutáveis sem pedido explícito**

| # | decisão | origem |
|---|---|---|
| D1 | **`AO VIVO` × `COMO EM T` são modos de primeira classe**, no chrome, não em menu | `SPEC-001` §6.1 |
| D2 | voltar de `COMO EM T` para `AGORA` **tem sintoma visível** — sem sintoma, **reprova** | D5.4, teste negativo |
| D3 | idade **só na borda direita do tempo**; gráfico de 3 dias tem **zero** carimbos de idade | `ADR-005` |
| D4 | a idade carimba o **FECHO** da janela, nunca o rótulo cru da fonte | D5.1 — **três dos quatro desenhos de UX erraram isto** |
| D5 | ausência de OI aparece com **linha-guia apontando para trás** até a marca real | D5.2 |
| D6 | `FLOW` ausente é **`—`**, nunca interpolado | D5.3 |
| D7 | o **bundle é a URL**; gerenciador de presets é produto prematuro | `SPEC-001` §7 |
| D8 | **zero seleção é informação** — nenhum nudge para mais disparos | `SPEC-001` §6.3 |
| D9 | marcação amarra à `price_source` usada; reabrir sob outra série **não a reexibe como se fosse a mesma** | D5.5 |
| D10 | **atribuição da TradingView na primeira tela**, não na última | `CA-F1-15` |
| **D11** | **direção de preço segue a convenção ocidental (verde/vermelho da TradingView)** e vive **só em `fill`** | [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) D-1 — declaração do owner + `validate_palette.js` (**18,0** PASS sob min3) |
| **D12** | **vazado = `close > open`, cheio = `close < open`, cruz = `close == open` (não afirma).** Redundância de forma **obrigatória**, e o **terceiro estado não é opcional** | `ADR-010` D-2 · §0.3 (cinza **1,09**) · §1.9 (o doji) |
| **D13** | **integridade do dado é VIOLETA** — `#581c87` / `#e0aaff` — no eixo do cone S | §1.4 · §1.4-ter — âmbar rejeitado por medição; azul rejeitado por **0,3** contra violeta; **magenta saturado rejeitado por 12,2** contra o vermelho de baixa |
| **D14** | **o numeral nunca é tingido por direção nem por integridade.** Um único eixo de tinta: procedência, sem hue | §1.5 — `#089981` dá **3,57** contra branco e **3,13** contra a listra: legal p/ forma, **ilegal p/ texto** nos dois casos |
| **D15** | **ação e procedência não consomem hue.** Ambas no canal de luminância | §1.1 — orçamento de hue tem 3 vagas e 3 ocupantes |
| **D16** | **o veredito de dicromacia é `min(protan, deutan, TRITAN)`**, sob Brettel 1997 com planos derivados em execução | §1.4-bis — Viénot 1999 **superestima tritan** e teria aprovado o par que reprova (42,6 contra 14,7) |
| **D17** | **severidade operacional não tem token de cor.** `coletor PAROU` é palavra + glifo + posição + contagem | §9 item 5 — e é a **restauração** de um escopo que a 2ª revisão encolheu |
| **D18** | **o anel de foco é deslocado** (`outline-offset > 0`); o vão é cor de superfície | §1.8 — `--foco` é **byte-idêntico** ao token que encosta ⇒ **1,00** sem o vão |
| **D19** | **toda cor do plot chega como argumento**, nunca lida de CSS dentro do canvas | §8 — `forced-colors` não afeta canvas ⇒ híbrido descasado. Gancho: `FR-1` (`ADR-003:36`) |

---

## 8. Pendências e dúvidas abertas

**São 14 perguntas do owner em aberto.** As que tocam tela:

| # | pergunta | efeito no design |
|---|---|---|
| `Q10` | qual é a "primeira tela": verificação ou operação? | decide se S2-mínima ou outra abre o app |
| `Q11` | — | fase `08` |
| `Q13` | esquema de cor | **RESPONDIDO pelo owner em 2026-08-25** (verde/vermelho, convenção ocidental); formalizado em [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md). Continua não gateando, mas o motivo mudou: **não** porque a troca é trivial — são **25 tokens, 4 com hue, 361 medições** — e sim porque ela é **mecânica e verificável por comando** |
| **novo** | **o owner usa Windows com modo de alto contraste?** | decide se o híbrido descasado do `<canvas>` (§8 do `DESIGN_SYSTEM`) é **defeito ativo** ou **dívida futura**. **Pergunta de uma linha, `[NÃO SEI]`** |
| **novo** | **`#e0aaff` lê como violeta ou como rosa?** | é o único resíduo não-aritmético da troca de `--dado-quebrado-ink`. Matiz e ΔE não decidem nomeação de cor |
| `Q16` | — | **gate da fase `05`** |
| `Q3` | canal de alarme fora do browser | o passo 7 da jornada não fecha sem ela |
| `Q20` | SMC × pivôs+Fibonacci | decide o que a **fase seguinte** detecta; aqui só `swing_point` |

**Não medido e é o maior risco técnico:** o eixo do Lightweight Charts aguenta **288 pontos + 1.440
candles** no mesmo eixo? Tolerância de **0,5 px** entre coordenada X e `event_time` original.

---

## 9. Prompt de continuidade

> **Cole isto no início de QUALQUER nova conversa do Stitch sobre este projeto.** Ele carrega o contexto,
> as decisões travadas e as guardas. Sem ele, o modelo renegocia o produto.
>
> **Reescrito em 2026-08-25 (3ª revisão do dia)** para fechar as 8 condições do gate `ux-ui-mastery`.
> **As correções das revisões 1 e 2 estão todas preservadas.** O que mudou nesta revisão:
>
> | item | mudança | condição |
> |---|---|---|
> | 1 | `3.13:1` era atribuído ao **branco**; é da **listra**. Contra branco são **3,57** | `C5` |
> | 2 | `VAZADO = ALTA` → `VAZADO = close > open`, e **terceiro estado: cruz/doji** | `C7`, `P2` |
> | 3 | violetas **trocados**: `#c084fc`→`#e0aaff`, `#6d28d9`→`#581c87`, por **tritanopia** | `C1` |
> | **5** | **RESTAURADO o escopo genérico.** Era *"alerta crítico fica FORA DO CANAL DE COR"* e a 2ª revisão o **estreitou** para integridade de dado — deixando a `S1` (*"o que parou"*) **sem regra** | `C4` |
> | 6 | `0.4` → **`0.3`** (azul × violeta em deutan) | `C6` |
> | 7 | **novo:** `--foco` é byte-idêntico ao token que encosta ⇒ `outline-offset` é requisito | `C2` |
> | 15 | **novo:** `forced-colors` afeta CSS e **não** afeta canvas ⇒ híbrido descasado | `C8` |
>
> ⚠️ **`C4` é a regressão que EU introduzi**, e vale registrar como ela aconteceu: a 2ª revisão
> reescreveu o item **melhor operacionalmente** (nomeou glifo, palavra e ordem dos canais) e **pior em
> escopo** — trocou "alerta crítico" por "integridade do dado". Sob o texto estreito, o gerador **não
> tinha regra** para `coletor PAROU`, e a saída provável era **barra vermelha preenchida**: satisfaz a
> letra do item 1 e **destrói a intenção**. Melhorar a redação de uma regra e encolher o seu domínio no
> mesmo movimento é um modo de falha silencioso, porque o diff parece um upgrade.

```text
CONTEXTO DO PROJETO — cripto-strategy

Plataforma pessoal, single-user, desktop-first, de analise quantitativa de cripto-derivativos.
Cruza tres camadas de dado — estrutura de preco, sentimento (Open Interest / Funding / Long-Short)
e order flow (CVD) — em prazos de 15m, 1h e 4h, com decisao no fechamento do bucket.
NAO e HFT: nenhum dado de tick chega ao navegador.

O PROBLEMA QUE O PRODUTO RESOLVE nao e "mostrar grafico". E impedir que um numero SEM PROCEDENCIA
chegue a uma decisao que gasta capital do usuario. Toda a interface se organiza em torno disso.

TELAS (4 com tela, 1 que e dado):
  S2 simbolo    NUCLEO OPERACIONAL. multi-painel (Preco, OI, CVD delta, CVD acumulado),
                replay point-in-time, marcacao de swing.
  S1 console    o que esta sendo gravado, o que parou, quanto disso e perda permanente.
                NAO e canal de alarme — e onde se diagnostica depois de ser avisado.
  S3 inspetor   o que este numero e, e quais linhas exatas o produziram. Inclui quarentena.
  S4 bancada    que taxa de disparo um limiar produziria, ANTES de escolher o limiar.
  S5 nao e tela: e uma funcao point-in-time atras de todo seletor de simbolo.

GOVERNANCA DE COR — O EIXO E O TIPO DE MARCA, NAO O SIGNIFICADO. NAO ALTERE NADA DISTO:

  Existem TRES tipos de marca, e cada um tem uma regra diferente:
    FILL  interior de forma geometrica (corpo e pavio de vela, area, barra). Piso 3:1.
    INK   glifo de texto e traco de icone — qualquer coisa que se LE. Piso 4.5:1.
    ON    tinta desenhada EM CIMA de um fill (etiqueta de eixo, badge de crosshair). Piso 4.5:1.

  1. DIRECAO DE PRECO usa a convencao ocidental, e usa os valores exatos da TradingView:
       alta  #089981   baixa  #f23645     (os DOIS valores servem os dois modos)
     Estes valores sao FILL e SOMENTE FILL: corpo de vela, pavio, area, barra.
     NAO EXISTE cor de texto de direcao. Numeral NUNCA e tingido por direcao.
     Isto foi medido, e a superficie importa: #089981 da 3.57:1 contra o BRANCO,
     3.36:1 contra o chrome claro e 3.13:1 contra a listra clara. Os TRES sao legais
     para FORMA (piso 3:1) e ILEGAIS para TEXTO (piso 4.5:1). Nao e escolha de estilo,
     e o que a norma permite.
     A tinta desenhada SOBRE esses fills (etiqueta do eixo de preco, badge do crosshair)
     e #131722 — tinta ESCURA sobre o fill, nunca branca. Medido: #131722 sobre o verde
     da 5.01:1 e sobre o vermelho da 4.59:1. Branco sobre #089981 daria 3.57:1 e reprova.

  2. REDUNDANCIA DE FORMA OBRIGATORIA na direcao, e ela tem TRES estados, nao dois.
     A forma codifica o PREDICADO, nao a palavra "alta":
       corpo VAZADO  =  close > open      (fechou acima da propria abertura)
       corpo CHEIO   =  close < open      (fechou abaixo da propria abertura)
       CRUZ (doji)   =  close == open     DIRECAO NAO AFIRMADA
     Motivo medido: a razao de luminancia entre os dois fills e 1.09, ou seja, em escala
     de cinza os dois sao a MESMA cor. Nenhum par de cores resolve isso — o par
     azul/laranja anterior tambem colapsava (1.38) e o verde/vermelho generico tambem
     (1.25). Vela vazada e a convencao japonesa original, anterior a cor.
     O TERCEIRO ESTADO NAO E DETALHE: quando open == close o corpo tem ~1 px e nao ha
     interior para esvaziar. Um doji e uma CRUZ — sem corpo, so pavio — e a cruz e
     inconfundivel contra vazado E contra cheio, em escala de cinza, sem cor nenhuma.
     NAO force altura minima de corpo para "salvar" o vazado/cheio: um corpo de 2-3 px
     AFIRMA uma direcao que o dado nao sustenta, e isto e a mesma classe de defeito que
     LOCF em serie FLOW e denominador inventado para serie de tick.
     O hue do corpo de 1 px de um doji nao carrega informacao nenhuma, porque a forma
     ja afirmou "nao houve direcao".

  3. INTEGRIDADE DO DADO — "este numero quebrou" — usa VIOLETA, nao vermelho:
       #e0aaff no modo escuro   (#581c87 no modo claro, que NAO e o que voce vai gerar)
     Motivo, e ele e uma ARQUITETURA DE DOIS EIXOS, nao uma preferencia:
       direcao vive no eixo L/M      morre em protanopia e deuteranopia (18.0 e 22.8),
                                     sobrevive em tritanopia (61.4),
                                     e e coberta por FORMA (vazado/cheio/cruz).
       integridade vive no eixo S    sobrevive em protanopia e deuteranopia (19.5),
                                     morre em tritanopia,
                                     e e coberta por GLIFO + PALAVRA.
     Os dois canais de hue falham sob dicromacias DISJUNTAS, e cada um e coberto por um
     canal NAO-CROMATICO DIFERENTE. Nenhuma dicromacia derruba os dois ao mesmo tempo.
     Ambar foi REJEITADO: sob dicromacia o vermelho colapsa para o amarelo-marrom.
     Violeta contra o vermelho de baixa mede 29.5, contra o verde de alta mede 26.9,
     contra a tinta fraca de procedencia mede 19.5. Passa o piso 15 nos tres.
     ATENCAO: estes valores de violeta foram TROCADOS em 2026-08-25. Os anteriores
     (#6d28d9 claro / #c084fc escuro) REPROVAVAM sob tritanopia — 5.3 e 14.7 contra a
     tinta fraca. Nao volte aos valores antigos.

  4. A COR E O TERCEIRO CANAL DA INTEGRIDADE, NUNCA O PRIMEIRO. A afirmacao chega por:
       GLIFO   um LOSANGO VAZADO, sempre o mesmo, e NAO e triangulo nem circulo — essas
               duas formas pertencem a severidade de dashboard e trariam vermelho de volta
               por habito. A FORMA SOZINHA tem de bastar em escala de cinza, sem cor nenhuma.
       TEXTO   a palavra: QUARENTENA, "idade ?", "sem procedencia".
       COR     violeta apenas no TRACO do losango e na regua vertical do selo. Acompanha.
     O losango NUNCA e vermelho e NUNCA preenche area. Integridade nunca tinge numeral.

  5. ALERTA E SEVERIDADE FICAM FORA DO CANAL DE COR. ESTA REGRA E GENERICA E VALE PARA
     TODA AFIRMACAO DE ESTADO GRAVE, NAO SO PARA INTEGRIDADE DE DADO.
     Nao existe token de cor de severidade. Nao existe --severidade-critico, nao existe
     vermelho de erro, nao existe ambar de aviso, nao existe barra vermelha preenchida.
     Isto inclui, e este e o caso que mais escapa:
       "coletor PAROU"        severidade OPERACIONAL. NAO e integridade de dado, e NAO
                              herda o violeta. A S1 e um console cujo job e "o que parou,
                              quanto disso e perda permanente" — e a saida errada seria
                              uma barra vermelha preenchida, que satisfaz a letra do
                              item 1 e destroi a intencao.
       "perda permanente"     idem. Vive em PALAVRA + GLIFO + luminancia de tinta.
       "backfill atrasado"    idem.
     COMO SE DESENHA severidade sem cor: pela PALAVRA explicita, pelo GLIFO estavel, pela
     POSICAO (o que parou vai para o topo da lista, nao fica colorido no meio dela), pela
     CONTAGEM (o numeral de quantos buckets se perderam) e pela luminancia da tinta de
     procedencia. Ordenar por gravidade e um canal; tingir por gravidade nao e.
     Quatro argumentos independentes sustentam isto: escassez de canal de hue (so ha tres
     vagas e as tres estao ocupadas) · forced-colors (item 13) · o contraste medido ·
     e tritanopia, que reprovou o violeta na primeira posicao em que ele foi posto.

  6. QUATRO PAPEIS DE COR MUTUAMENTE EXCLUSIVOS, que nunca se cruzam:
       direcao de preco   verde/vermelho, so em FILL, mais forma vazado/cheio/cruz
       integridade        violeta, so em INK, mais losango, mais palavra
       procedencia        SEM HUE. E luminancia de tinta neutra, mais halo, mais o caractere ~
       marca e acao       SEM HUE. E luminancia, mais borda
     So existem TRES hues nesta interface: verde-teal, vermelho, violeta. Nada mais.
     ACAO NAO E AZUL. Medido: azul de acao contra violeta de integridade da 0.3 sob
     deuteranopia, ou seja, sao a MESMA cor. Botao e selo quebrado dividem o cabecalho de
     painel, entao essa colisao seria real. Botao usa fill #333846 com borda #8b949e e
     texto #e6e9ef. A BORDA e que carrega a fronteira, porque o fill sozinho da 1.32:1.

  7. O ANEL DE FOCO E DESLOCADO, E ISSO E REQUISITO, NAO ESTILO.
     O anel de foco usa #8b949e no escuro (#131722 no claro) — os MESMOS valores da borda
     e do fill do botao. Encostados, o contraste entre eles e 1.00 e A FRONTEIRA NAO
     EXISTE. Portanto: outline-offset MAIOR QUE ZERO, sempre, e o vao entre o anel e a
     borda do botao e COR DE SUPERFICIE. Le-se como TRES faixas: borda, vao, anel.
     Medido: no pior caso o anel contra o vao da 4.89:1, contra piso 3:1. Passa.
     Com outline-offset: 0 o valor real e 1.00 e REPROVA.
     Nao troque o anel por um hue "de foco": nao ha vaga no orcamento de hue.

  8. O NUMERAL TEM UM UNICO EIXO DE TINTA: o de procedencia, e ele NAO TEM HUE.
       tinta forte  #e6e9ef    tinta fraca  #8b949e
     "Tinta fraca" NAO pode ser cinza claro nem opacity 0.6: tem de passar 4.5:1 porque e
     TEXTO. #8b949e da 4.89:1 contra a superficie mais clara e e o PISO do que "fraca" pode ser.
     O SINAL de um delta e lido por TRES canais, nenhum deles cor:
       (a) o caractere de sinal, SEMPRE presente: "+1.234" e "-1.234". O "+" nao e opcional.
           Em figuras tabulares o sinal ocupa COLUNA FIXA e a coluna se le de relance.
       (b) a geometria do plot: posicao em relacao a linha de base zero.
       (c) opcionalmente uma mini-barra na celula. Barra e FORMA, entao pode usar o fill
           de direcao. E o unico lugar em que hue de direcao entra numa tabela.

  9. SUPERFICIES. Gere no MODO ESCURO, com exatamente estas tres:
       #131722  fundo do plot e do painel — e onde os fills de direcao sao desenhados
       #0d1017  chrome global e cabecalho de painel
       #222634  listra de tabela e linha em hover
     NENHUM fill colorido pode ser desenhado sobre superficie fora deste conjunto.
     Nao invente uma quarta superficie, nao use gradiente, nao use vidro nem blur.

 10. NENHUM numeral de mercado aparece sem um SELO de quatro campos, VISIVEL SEM HOVER.
     Tooltip nao conta. Os campos sao:
       serie      rotulo completo lido do catalogo, com unidade. Ex: "OI · grade 5m · BTC · bn-dump".
                  As palavras OI, funding, L/S e CVD SOZINHAS nao existem nesta interface.
       idade      (tempo de referencia da LEITURA) menos available_at. NUNCA "agora menos
                  available_at". Em COMO EM T o tempo de referencia e T, NUNCA o relogio de
                  parede. O carimbo e do FECHO da janela, nunca do rotulo cru da fonte.
                  So aparece na borda direita do tempo.
                  Quando o atraso do endpoint nao foi medido, a idade NAO e exibida: a
                  afirmacao "nao sabemos a idade" pertence ao canal de INTEGRIDADE
                  (losango mais palavra), nao ao campo idade.
       procedencia  OBSERVADO (tinta forte), DERIVADO (tinta forte, mostrando a expressao
                    que o gerou), MODELADO (tinta fraca, com um til antes do valor),
                    HUMANO (HALO, isto e, contorno adicionado POR FORA e deslocado, ao redor
                    da marca de anotacao; e o unico conteudo que o usuario criou).
                    O halo do HUMANO e coisa diferente do corpo vazado da vela em que
                    close > open: halo se ADICIONA por fora de uma marca de anotacao;
                    vazado ESVAZIA o interior de um corpo de vela. Vela nunca e anotacao.
       completude   "285/288 · 1 lacuna" para serie de grade. Para serie de tick, escreva
                    "contiguidade (N saltos)": serie de tick NAO TEM denominador esperado,
                    e inventar um denominador ali e defeito.

 11. Numeral usa PONTO decimal, sem separador de milhar. Portugues do Brasil aparece
     apenas em microcopy e rotulo de eixo, nunca no numeral.

 12. Contexto e ICADO, nao repetido: sessao carrega fuso/modo/versao uma vez por tela;
     painel carrega identidade/fonte/unidade/procedencia uma vez por painel, SEMPRE VISIVEL
     e nunca em tooltip; o numero carrega apenas a idade.

 13. TODO numeral usa figuras TABULARES (font-variant-numeric: tabular-nums), em fonte
     monoespacada. Coluna de numeral que desalinha ao atualizar e defeito, nao estilo.
     Isto nao e cosmetico: o item 6(a) depende do sinal ocupar coluna fixa.

 14. Densidade ANALITICA, nao densidade de marketing: linha de tabela ~32px, texto
     secundario 12-13px, padding minimo, sem card espacado e sem sombra. O leitor e um
     analista em sessao longa, nao um visitante.

 15. MODO DE ALTO CONTRASTE DO SISTEMA (forced-colors). Duas metades da tela se comportam
     de forma OPOSTA, e assumir o contrario e o defeito:
       o CHROME e CSS      => o sistema SOBRESCREVE as cores. O que sobrevive e glifo e texto.
       o PLOT e <canvas>   => o sistema NAO afeta bitmap de canvas. As velas MANTEM
                              verde/vermelho enquanto tudo em volta vira cor de sistema.
     Consequencia: nao existe "degradacao graciosa" aqui, existe HIBRIDO DESCASADO. E e
     por isso que severidade e integridade nao podem depender de hue: um canal de cor que
     funciona em METADE da superficie e pior que um que nao funciona.
     Regra de desenho: toda cor que o plot usa tem de poder CHEGAR COMO ARGUMENTO, nunca
     ser lida de CSS dentro do canvas. Nao desenhe nada cuja unica leitura seja a cor.

DECISOES DE UX TRAVADAS:
  - "AO VIVO" e "COMO EM T" sao modos de primeira classe, no chrome global, nunca escondidos em menu.
  - Um grafico de tres dias tem ZERO carimbos de idade, e isso esta correto.
  - Ausencia de dado nunca e interpolada em silencio. Serie de fluxo ausente mostra um travessao.
    Serie de estoque mostra o ultimo valor em tinta fraca, com a hora real e uma
    linha-guia apontando PARA TRAS ate a medida verdadeira.
  - Zero legitimo do fornecedor e uma MARCA desenhada na linha de base, distinguivel de
    ausencia. "Nao houve liquidacao" e "nao sabemos" nao sao a mesma afirmacao.
  - O conjunto de parametros E a URL. NAO existe gerenciador de presets, nao existe CRUD de layout.
  - Chrome global mostra sempre: ambiente (mainnet/testnet/demo/replay), modo, versao do conjunto.
  - A TradingView e creditada com link na primeira tela publica, nao na ultima. E obrigacao
    de licenca do lightweight-charts, nao rodape opcional.

FORA DE ESCOPO — NAO DESENHE, por mais natural que pareca num produto de trading:
  - sinal de compra/venda, score de confluencia, recomendacao
  - placar de performance (win rate, profit factor, drawdown, sharpe)
  - entrada de ordem, carteira, saldo, posicao, execucao
  - detectores de padrao nomeados (order block, FVG, BOS, CHoCH, Fibonacci)
  - watchlist multi-simbolo ao vivo, painel de liquidacao, gerenciador de layouts
  - qualquer elemento que EMPURRE o usuario a mais operacoes. Zero selecao e informacao valida,
    e a ausencia dessa afordancia e deliberada.

REGRAS DESTA CONVERSA:
  - Nao redesenhe nenhuma tela agora.
  - Nao simplifique este resumo e nao o reescreva.
  - Nao transforme isto em terminal de corretora, bot de sinais, rede social de traders,
    plataforma de copy trade ou dashboard generico de cripto.
  - Preserve a S2 como nucleo operacional do produto.
  - Preserve desktop-first e usuario unico. Nao invente equipe, permissao por papel ou multi-tenant.
  - Diferencie sempre: serie, painel, simbolo, bucket e observacao sao coisas distintas.

LEMBRETE FINAL, e sao as quatro restricoes mais violadas:
  1. NENHUM numeral de mercado aparece sem o selo de quatro campos visivel sem hover.
  2. Vermelho e verde vivem SO no preenchimento de forma. Nenhum numeral, rotulo, sinal
     de delta ou texto e tingido de verde nem de vermelho, em lugar nenhum da tela.
  3. "Dado quebrado" e VIOLETA mais LOSANGO VAZADO mais PALAVRA. Nunca vermelho.
  4. ALERTA E SEVERIDADE NAO TEM COR. "Coletor PAROU" nao e barra vermelha e nao e
     violeta: e palavra, glifo, posicao e contagem. Isto vale para TODA afirmacao de
     estado grave, nao so para integridade de dado.

PROXIMA TAREFA: aguarde a instrucao especifica.
```
