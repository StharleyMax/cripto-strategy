# DESIGN_SYSTEM.md — cripto-strategy

**Data:** 2026-08-25 (**terceira** revisão do dia) · **Deriva de:** [`ADR-010`](../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) · [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §6 · `CA-F4-10` · plano [`05`](../plans/SPEC-001-plataforma-dados/05_fatia_visivel.md) D5.6
**Status:** **§1 REVISADO na 3ª rodada** — tritanopia MEDIDA, o violeta TROCADO nos dois modos, `--foco` declarado.
**5ª rodada (2026-08-25, reabertura sob gate `REPROVADO`):** nada de cor mudou — **os 25 tokens e as
361 medições são os mesmos, `node scripts/validate_palette.js` continua `exit 0`.** O que se aprendeu
é sobre a **FERRAMENTA**, e está em `STITCH_CONTEXT.md` §5.2/§5.3: `update_design_system` **regenera**
em vez de atualizar (descarta `designMd`, `displayName` e `labelFont`) · `roundness` é **obrigatório**
e **não existe valor 0px** ⇒ cantos retos só chegam por **prosa** · a escada de `error` (`#ffb4ab`
C* 30,39 e mais três) é **inexpurgável do esquema**, e a defesa medida é a prosa: `text-error`
aplicado caiu de **2 para 0** na tela · o tema **100% acromático é alcançável** (43 de 47 tokens sob
o teto C* **9,95**, zero violeta) e a condição é **sobrescrever o slot com valor acromático**, nunca
deixá-lo à derivação. ⚠️ **E um achado que é regra de governança, não de ferramenta:** pôr
`--dado-quebrado-ink` num slot de tema (`overrideSecondaryColor`) **não acrescenta um hue —
acrescenta SETE**, porque o sistema deriva uma escada tonal por slot, e um deles
(`on_secondary_container #d9a4f8`) mede **1,6** contra `#e0aaff` nas três dicromacias **e tem papel
de TEXTO**. ⇒ **`D-3` (integridade) tem de sair do tema pelo mesmo motivo que `D-1` (direção) já
estava fora: os três hues governados são Tier 3 num esquema que só tem Tier 2.**

**4ª rodada (2026-08-25, `--sync`):** §0.2 **tarjado** (o "sem trade-off" era overclaim: são **33,1 ΔE** aceitos) · **§1.4-quinquies novo** — procedência-como-tint reprova por **aritmética**, não só por escassez · §1.4-quater ganhou o par que **de fato ocorreu numa tela** (`#a8c8ff × #e0aaff` = **0,9**, valor **derivado** de uma semente que passava).
**Documento vivo** — atualizado por `/design --sync`, nunca por prompt do Stitch.
**Comando de verificação (GATE):** `node scripts/validate_palette.js` — **361 medições, exit 0, sob as TRÊS dicromacias.**
**Comando de auditoria (NÃO é gate):** `bash scripts/measure_stitch_drift.sh` — mede os valores **rejeitados** que apareceram no Stitch. **Extrai o estimador das linhas 1–185 do gate em tempo de execução**, para que não exista uma segunda cópia capaz de divergir em silêncio.
**Estimador de recorde:** **Brettel, Viénot & Mollon (1997)**, dois semiplanos, planos **derivados em execução**. Viénot 1999 foi **rebaixado** — ver §1.4.

> **Este design system não é preferência estética. Ele é consequência de medição.** Onde há número, há
> comando por trás. Onde não há, está marcado `[NÃO MEDIDO]` e é candidato a mudar.
>
> **Este repositório não apaga erro em silêncio: ele tarja.** Tudo que foi revogado hoje continua
> abaixo, legível, com a data e o motivo da revogação. §0.4 é o histórico da decisão derrubada.

---

## 0. ⛔ REVOGADO em 2026-08-25 — a inversão total de vermelho está derrubada

> ### 🚫 O que era, e não é mais
>
> ~~"Nesta plataforma, vermelho significa 'o dado quebrou'. Não significa 'o preço caiu'. Vela de baixa
> não é vermelha."~~
>
> **Revogado. E não por gosto: por dado.** O owner declarou, literalmente:
>
> > *"n ter o vermelho tbm foi super estranho, concordo. Ainda teriamos que reensinar o usuário sobre
> > algo que é difundido. E sim, utilizo muito o tradingview."*
>
> Isso **realiza o falsificador que a própria auditoria havia nomeado**: *"Jakob's Law morde de verdade
> se o owner olha TradingView (verde/vermelho) e esta tela lado a lado no mesmo monitor. Aí não há
> amortização — há alternância."* O owner confirmou a premissa do falsificador. ⇒ a hipótese cai.

### 0.1 O argumento, e a fonte lida

`ux-ui-mastery` v3.0.0, `skills/cognitive-psychology-ux/references/laws-of-ux-encyclopedia.md` §4
(Jakob's Law), linha 170:

> *"Users transfer expectations from one product to another. (...) **Reserve novelty for your unique
> value proposition, not for standard interaction patterns.**"*

Essa frase resolve o caso sozinha, porque nomeia **onde** a novidade é permitida:

| coisa | é a proposta de valor única deste produto? | portanto |
|---|---|---|
| **direção de preço** | **não.** Todo terminal do planeta faz isso, e o owner lê um deles todo dia | **siga a convenção** |
| **integridade do dado** | **sim.** É literalmente a razão de o produto existir | **aqui a novidade é permitida** |

A rodada anterior gastou a novidade no lugar errado: pôs o desvio na direção de preço (padrão) e deixou
a integridade (proposta única) sem canal próprio. **A inversão estava trocada de lado.**

Segundo apoio, `skills/nng-ux-heuristics/SKILL.md` §H4 (Consistency and Standards):
*"Severity when violated: **Medium** — inconsistency increases learning time by **25-50%** and erodes
trust."* Custo de aprendizado num produto de **um único usuário**, em sessão longa, **sobre o dado que
ele mais olha**: não vale.

Terceiro apoio, `skills/cognitive-psychology-ux/references/laws-of-ux-encyclopedia.md` §10
(Von Restorff / Isolation Effect) — e este é o argumento que **fortalece** a mudança em vez de a tolerar:

> *"Anti-pattern: overusing the isolation effect so that multiple elements compete for attention.
> **If everything is bold, colorful, and oversized, nothing is distinctive** and the effect collapses."*

Sob a paleta antiga, **vermelho era o canal de integridade e a vela de baixa era laranja** — dois hues
quentes, adjacentes, competindo. Medido: `#d03b3b ↔ #eb6834` = **11,3** em deutan, e
`#f23645 ↔ #eb6834` = **5,3** em deutan, o **pior par já medido neste projeto**. O canal de integridade
não era isolado; ele estava disputando atenção com o objeto mais numeroso da tela. **A nova governança
dá à integridade um hue que não existe em nenhum outro lugar da tela** — e é isso que Von Restorff pede.

### 0.1-bis A correção China/Japão continua VÁLIDA — e ela agora aponta para o outro lado

A tarja preservada em §0.4 diz, corretamente, que **não existe "a" convenção do setor: existem duas**
(ocidental verde-alta, China/Japão vermelho-alta), e que por isso **nenhuma tem direito de veto**.

**Isso segue verdadeiro, e é exatamente o que autoriza a decisão nova.** Se nenhuma convenção tem veto
*a priori*, então o critério de desempate não é "a convenção do setor" — é **qual convenção este usuário
específico já tem internalizada**. Este produto é **single-user**, e o usuário declarou usar TradingView
todo dia, na configuração ocidental. ⇒ para **N=1**, "duas convenções incompatíveis" colapsa em **uma**,
que é a do monitor ao lado. A tarja não foi enfraquecida; ela foi **aplicada**.

**Falsificador:** se o produto deixar de ser single-user — segundo operador, ou o owner mudando o tema
da TradingView para a convenção asiática — o desempate perde a base e a governança de direção volta à
mesa. **Registro isto como a condição de validade da decisão, não como nota de rodapé.**

### 0.2 O que a medição disse — e ela decidiu MAIS do que a preferência do owner pedia

`node scripts/validate_palette.js`

```
#089981 x #f23645  protan 18.0  deutan 22.8  tritan 61.4  normal 65.6  min3 18.0  PASS
```

**O par verde/vermelho da TradingView PASSA no piso de dicromacia.** Isto não era esperado — o
verde/vermelho *genérico* (`#008300 ↔ #e34948`) mede **12,2** em deutan e é **WARN**. A diferença é que
a TradingView escolheu um verde **deslocado para o teal** (`#089981`, matiz **176°** em Lab) e um vermelho
**claro e rosado** (`#f23645`, matiz **28°**), e esse deslocamento é exatamente o que separa o par sob
dicromacia.

> **⚠️ Tarja de 2026-08-25 (3ª revisão).** Este bloco publicava `protan 18.2 deutan 23.5 min 18.2` sob
> **Viénot 1999**. O estimador de recorde passou a ser **Brettel 1997** e os números são
> **`18.0 / 22.8 / 61.4`, min3 `18.0`**. **A conclusão não muda** e o veredito continua `PASS` com folga
> de 3,0 sobre o piso. Registro a diferença porque trocar estimador em silêncio é o defeito que este
> arquivo mais teme. ~~*"matiz ≈168°"*~~ também estava errado: medido em Lab, o matiz de `#089981` é
> **176°**.

⇒ **Seguir a convenção que o owner já lê **e** passar no critério de dicromacia são a mesma
decisão.** A rodada anterior pagou um custo de reaprendizado para comprar uma robustez que a
convenção já entregava.

> ### ⚠️ TARJA de 2026-08-25 (4ª revisão) — **"não existe trade-off aqui" era OVERCLAIM meu**
>
> ~~⇒ **não existe trade-off aqui.**~~
>
> **Existe, e é medido.** `[MEDIDO: bash scripts/measure_stitch_drift.sh, BLOCO D2]`
>
> ```
> #2a78d6 x #eb6834  (REVOGADO)  min3 51.1  PASS
> #089981 x #f23645  (EM VIGOR)  min3 18.0  PASS
> ```
>
> **O par revogado media 51,1 e o adotado mede 18,0** ⇒ a troca **custou 33,1 ΔE** de separação
> sob dicromacia. Os dois passam o piso de 15, e é por isso que **a decisão não muda**: o que se
> exige do par de direção é *passar*, não *maximizar* — a direção é coberta por **forma**
> (vazado/cheio/cruz), e o hue é acelerador, não portador (§1.4).
>
> **Mas "não existe trade-off" é falso, e a diferença importa.** O correto é: **o trade-off é de
> 33,1 ΔE e foi ACEITO, porque a Lei de Jakob decide e o piso ainda passa com folga de 3,0.**
> Uma decisão com custo declarado é auditável; uma decisão anunciada como grátis não é — e este
> arquivo tem uma regra própria contra isso (§1.4-quater).
>
> **Como o erro aconteceu:** eu comparei o par adotado **contra o piso** (18,0 > 15 ⇒ passa) e
> concluí "sem trade-off", sem comparar **contra a alternativa** (51,1). Piso e alternativa
> respondem perguntas diferentes, e eu troquei uma pela outra.

### 0.3 O que a medição REPROVOU, e que nenhuma escolha de hue conserta

```
BLOCO 6 — colapso em escala de cinza: razao de LUMINANCIA entre os dois fills de direcao
  #089981 x #f23645  1.092  COLAPSA  verde/vermelho da TradingView — o par ADOTADO
  #2a78d6 x #eb6834  1.380  COLAPSA  azul/laranja — o par anterior
  #008300 x #e34948  1.251  COLAPSA  verde/vermelho generico
```

**Nenhum par de hue sobrevive à escala de cinza.** Nem o novo, nem o antigo, nem o genérico. Piso lido
de WCAG 2.2 **SC 1.4.1 (Use of Color)** — informação não pode depender só de cor.

⇒ **canal de FORMA obrigatório para direção**, e ele tem **três** estados, não dois:

```
corpo VAZADO  =  close > open
corpo CHEIO   =  close < open
CRUZ (doji)   =  close == open   ⇒   DIREÇÃO NÃO AFIRMADA     (ver §1.9)
```

E ela **não** é um custo de ter escolhido verde/vermelho: o par azul/laranja anterior colapsava igual, e
ninguém havia medido.

> ### ⚠️ Correção de uma ALEGAÇÃO minha, e o gate estava certo em duvidar dela
>
> ~~*"é um tipo de gráfico nativo da TradingView ('Hollow candles') — ou seja, a redundância também é
> Jakob-compatível."*~~ **A alegação estava invertida no único ponto que importa.**
>
> Nas *hollow candles* da TradingView, **vazado codifica `close` vs `open`** enquanto a **cor** codifica
> `close` vs **fechamento anterior**. São **dois predicados diferentes** e há **quatro** combinações
> (vazado+verde, vazado+vermelho, cheio+verde, cheio+vermelho). ⇒ naquele tipo de gráfico
> **vazado ≠ "subiu"**, e a expectativa que um usuário transfere de lá é *"fechou acima da sua abertura"*,
> **não** *"subiu"*.
>
> **O que sobrevive, e é o que eu deveria ter escrito:** o **canal de forma** é Jakob-compatível —
> "vazado" significa exatamente `close > open` nos dois sistemas. O que **não** transfere é o
> **pareamento** forma×cor. Nesta plataforma os dois canais são **redundantes** (ambos = `close` vs
> `open`), o que é mais simples que hollow candles, e é por isso que **a palavra "alta" foi substituída
> pelo predicado `close > open` em todo o documento e no §9**: "alta" era ambíguo entre "fechou acima da
> abertura" e "subiu em relação à barra anterior", e essa ambiguidade era minha, não do owner.
>
> **`[NÃO SEI]`** se um usuário vindo de *hollow candles* vai esperar que a cor signifique
> `close` vs fechamento anterior e ler errado. É risco residual **nomeado**, sem medição — e com N=1 não
> haverá amostra. A **decisão não muda** (SC 1.4.1 exige forma de qualquer jeito); a **alegação** muda.
> Não cito mais "Hollow candles" como apoio de Jakob para o *pareamento*; cito só para a forma.

### 0.4 Histórico da decisão revogada — **preservado na íntegra**

> Tudo abaixo desta linha até o fim do §0 é o texto de 2026-08-25 (primeira emissão) **com as suas três
> correções originais intactas**. Está aqui porque as **medições continuam válidas e continuam
> reproduzindo** — o que caiu foi a *conclusão de produto*, não a aritmética. As tarjas de erro
> permanecem exatamente como foram escritas.

> **Correção de 2026-08-25, e ela FORTALECE a decisão em vez de enfraquecê-la.** Uma versão anterior dizia
> *"toda convenção de terminal de trading diz o contrário"*. **É falso, e a auditoria trouxe a fonte:** em
> mercados da China e do Japão, **vermelho é ALTA** e verde é baixa. Metade do volume de cripto-derivativos
> do planeta é operada sob a convenção oposta. ⇒ **não existe "a" convenção do setor: existem duas,
> incompatíveis, e portanto nenhuma tem direito de veto sobre esta tela.**
Se vermelho já está gasto sinalizando direção de preço, não sobra canal para sinalizar que o dado é
inválido — e é o dado inválido que custa capital.

**Consequência dura, e ela é o teste de aceitação:** vela de baixa **não é vermelha**. Se aparecer vermelho
num candle, o design system está violado.

### E a medição confirma a decisão por um segundo caminho independente

| par | protan ΔE | deutan ΔE | veredito |
|---|---|---|---|
| `#2a78d6` ↔ `#eb6834` | **24,7** | **26,8** | **PASS** — é o par de direção |
| `#008300` ↔ `#e34948` | 7,2 | 8,6 | **WARN** — o verde/vermelho clássico é fraco |
| `#d03b3b` ↔ `#eb6834` | **10,8** | — | **FAIL** (piso 15) — **não coexistem** |

`[MEDIDO: validate_palette.js, D5.6]`

### ⚠️ Correção de 2026-08-25 — os números da tabela acima NÃO REPRODUZEM, e o DoD D5.6 não é executável como está

`validate_palette.js` **não existia** — `D5.6` o nomeia como comando, e ninguém o havia escrito. Escrevi-o
([`scripts/validate_palette.js`](../../scripts/validate_palette.js)) com o estimador **declarado**:
simulação de dicromacia **Viénot, Brettel & Mollon (1999)** (transform linear em LMS) + distância
**CIEDE2000**, D65, observador 2°. Rodei sobre os mesmos pares:

| par | protan | deutan | visão normal | publicado antes |
|---|---|---|---|---|
| `#2a78d6` ↔ `#eb6834` | **57,2** | **66,8** | 48,5 | 24,7 / 26,8 |
| `#008300` ↔ `#e34948` | **15,1** | **12,2** | 69,9 | 7,2 / 8,6 |
| `#d03b3b` ↔ `#eb6834` | **15,7** | **11,3** | 16,0 | 10,8 |

**Nenhum reproduz.** A divergência é de **~2×** e não é ruído — é **estimador diferente**, exatamente a
classe de defeito que este projeto já mediu em razões `×p90` (`numpy.percentile` → 10,3× contra
`statistics.quantiles` → 9,0×).

**Consequência que importa mais que os números: o piso `ΔE >= 15` do `D5.6` foi calibrado contra o
estimador desconhecido, logo ele não transporta.** Um DoD cujo piso e cujo estimador vêm de origens
diferentes aprova ou reprova pelo motivo errado.

> **⚠️ Correção de um erro meu, apontado pela auditoria de 2026-08-25.** Uma versão anterior deste
> parágrafo afirmava que `#d03b3b` ↔ `#eb6834` *"marcaria 15,7 — passa"* sob o novo estimador. **Falso.**
> O script veredita pelo **pior dos dois tipos** (`Math.min(protan, deutan)`), logo `min(15,7; 11,3) =
> 11,3` ⇒ **`WARN`**, não `PASS`. O argumento genérico (piso e estimador de origens diferentes não
> transportam) segue válido; **o exemplo escolhido para prová-lo estava errado**, e o eixo correto é o
> deutan.

**E o piso não tem procedência.** `PISO_DICROMACIA = 15` e `FRACAO_WARN = 0,45` são **adotados por este
projeto**, sem norma citável por trás — está declarado no cabeçalho do script. Registro a ironia porque
ela é estrutural: **o piso do teste de procedência não tinha procedência.**

⇒ **`D5.6` tem de fixar as duas coisas juntas: o script E o piso.** Registrado como defeito a carregar
para a fase `05`.

### O que sobrevive à divergência — e é o que decide a cor

**A ORDENAÇÃO dos pares é a mesma nos dois estimadores.** Par de direção folgado; verde/vermelho clássico
fraco; vermelho-contra-laranja pior ainda. Conclusão **robusta ao estimador**, porque é comparação relativa
dentro da mesma escala:

| par | protan | deutan | veredito |
|---|---|---|---|
| `#f23645` ↔ `#eb6834` — **o vermelho que o Stitch escolheu, contra a vela de baixa** | 13,6 | **5,3** | **FAIL — o PIOR dos cinco pares** |
| `#f23645` ↔ `#2a78d6` — o mesmo vermelho contra a vela de alta | 46,1 | 62,4 | PASS |

**`5,3` em deutan é o número que decide.** O vermelho de alerta do Stitch é, para um observador deuteranope,
**praticamente indistinguível da vela de baixa** — pior que o `#d03b3b` que a rodada anterior já havia
rejeitado. Isso **confirma §1.1 por medição e não por princípio**: `critical` **tem** de viver fora do
canal de cor, porque não existe vermelho que conviva com um laranja de baixa.

A terceira linha é a que fecha o argumento: se a vela de baixa fosse laranja `#eb6834` **e** o alerta
crítico fosse vermelho `#d03b3b`, os dois seriam **indistinguíveis** para um observador protanope. Ou
seja — a aritmética de contraste chega sozinha à mesma conclusão que o domínio: **azul/laranja para
direção, e `critical` fora do canal de cor.**

---

### ⚠️ O que NÃO estava medido, e reprova: contraste contra superfície

ΔE de dicromacia compara **dois papéis entre si**. Não diz nada sobre cada cor **contra o fundo** — que é
WCAG 2.2 **1.4.3** (texto, 4,5:1) e **1.4.11** (objeto gráfico, 3:1), e atinge **100% dos leitores**, não
os ~8% dicromatas. Medido agora, contra cinco superfícies candidatas (nenhuma delas declarada em documento
nenhum até hoje — o que é parte do problema):

| papel | `#ffffff` | `#f5f5f5` | `#171717` | `#1e222d` | `#262626` |
|---|---|---|---|---|---|
| `--preco-alta` `#2a78d6` | 4,42 | 4,05 | 4,06 | 3,60 | 3,43 |
| `--preco-baixa` `#eb6834` | 3,20 | **2,94 ⛔** | 5,60 ✓ | 4,96 ✓ | 4,73 ✓ |
| `--dado-quebrado` `#d03b3b` | 4,80 ✓ | 4,41 | 3,73 | 3,31 | 3,15 |
| `#f23645` (o vermelho do Stitch) | 3,90 | 3,57 | 4,60 ✓ | 4,08 | 3,88 |

Três consequências, e as duas primeiras são reprovação:

1. **`#2a78d6` não alcança 4,5:1 em NENHUMA das cinco superfícies** (máximo 4,42). ⇒ se a cor de alta
   tocar **glifo de texto** — numeral tingido por direção, rótulo de legenda, sinal de um delta — é
   reprovação de **1.4.3 AA** em qualquer modo. **Decisão barata que resolve: cor de direção nunca tinge
   glifo, só preenchimento de forma.**
2. **`#eb6834` sobre `#f5f5f5` dá 2,94** — abaixo até do piso de **3:1** para objeto gráfico, que é
   exatamente o critério que rege candle. ⇒ plot claro-cinza está **proibido** com esta cor de baixa.
3. **`--dado-quebrado` é o papel mais fraco justamente no modo escuro** (3,15–3,73) — o modo que um gerador
   escolhe por default. O canal de reforço da afirmação *"este número não é confiável"* seria o mais fraco
   onde ele mais importa. **É o terceiro argumento independente para `critical` viver fora da cor.**

**⇒ falta declarar as superfícies como token, e uma variante `-fill` / `-text` por papel.** Isso derruba a
afirmação *"trocar o esquema é trocar 2 tokens"* de §1.2: a matriz real é papel(4) × modo(2) ×
variante(2) = **16 valores**.


---

## 1. Governança de cor — **o eixo é o TIPO DE MARCA, não o significado**

**A mudança estrutural:** antes, um papel era dono de um *hue*. Agora um papel é dono de um
**(hue × tipo de marca × modo)**, e o token só existe para as combinações permitidas. **A guarda deixa
de ser uma regra que alguém tem de lembrar e passa a ser a ausência do token.** Não se pode tingir um
numeral com a cor de direção porque `--direcao-alta-text` **não existe**.

Três tipos de marca, e cada um é fisicamente diferente:

| tipo de marca | o que é | piso WCAG que o rege |
|---|---|---|
| **`fill`** | interior de forma geométrica: corpo e pavio de vela, área, barra, mini-barra em célula | **3:1** (SC 1.4.11) |
| **`ink`** | glifo de texto e traço de ícone — qualquer coisa que se **lê** | **4,5:1** (SC 1.4.3) |
| **`on`** | tinta desenhada **em cima de um `fill`** — etiqueta de eixo, badge de crosshair | **4,5:1 contra o fill** |

### 1.1 Os 4 papéis, e o canal que cada um possui

| papel | canal que possui | tipo de marca permitido | **token que NÃO existe** (e a ausência é a regra) |
|---|---|---|---|
| **Direção de preço** | hue **verde↔vermelho** + **forma** (vazado/cheio) | `fill`, `on` | **`--direcao-*-text`** ⇒ direção **nunca** tinge glifo |
| **Integridade do dado** | hue **violeta** + **glifo** (losango) + **texto** | `ink` | **`--dado-quebrado-fill`** ⇒ integridade **nunca** preenche área, **nunca** tinge numeral |
| **Procedência** | **luminância** de tinta neutra (sem hue) + **halo** + o caractere `~` | `ink` | não tem hue nenhum — não existe `--proc-*-hue` |
| **Marca / ação** | **luminância** (sem hue) + **borda** | `fill`, `on` | **`--acao-*-hue`** ⇒ ação não consome hue |

**Só três hues existem nesta interface: verde-teal, vermelho, violeta.** Ação e procedência vivem no
canal de **luminância**, e é por isso que a paleta cabe: **o orçamento de hue tem 3 vagas e há 3
ocupantes.**

### 1.2 Os valores, medidos, nos dois modos

**Superfícies — declaradas por primeira vez.** Até hoje não existiam em documento nenhum, e **sem elas
nenhum contraste é verificável**, porque contraste é sempre *contra* algo.

| token | claro | escuro | papel |
|---|---|---|---|
| `--sup-base` | `#ffffff` | `#131722` | fundo do **plot** e do painel — é onde os `fill` de direção vivem |
| `--sup-chrome` | `#f7f8fa` | `#0d1017` | chrome global e cabeçalho de painel |
| `--sup-listra` | `#eff0f2` | `#222634` | listra de tabela / linha em hover. **É o extremo**: no claro a mais escura, no escuro a mais clara ⇒ é o **pior caso** de cada modo |

`#131722` e `#222634` são os valores de superfície da **TradingView**. Jakob's Law aplicada à superfície,
não só ao candle.

> **REGRA DURA:** **nenhum `fill` cromático pode ser desenhado sobre superfície fora deste conjunto.**
> É esta regra que torna o contraste verificável. A rodada anterior descobriu por medição que
> `#eb6834` sobre `#f5f5f5` dava **2,94** — abaixo do piso de 3:1 — e o motivo era que **`#f5f5f5` nunca
> havia sido declarado**. Superfície não declarada é superfície não medida.

**Papéis:**

| token | claro | escuro | tipo | piso | pior contraste medido |
|---|---|---|---|---|---|
| `--direcao-alta-fill` | `#089981` | `#089981` | `fill` | 3,0 | **3,13** claro · **4,22** escuro |
| `--direcao-baixa-fill` | `#f23645` | `#f23645` | `fill` | 3,0 | **3,42** claro · **3,86** escuro |
| `--direcao-on` | `#131722` | `#131722` | `on` | 4,5 | **5,01** sobre o verde · **4,59** sobre o vermelho |
| **`--dado-quebrado-ink`** | **`#581c87`** | **`#e0aaff`** | `ink` | 4,5 | **9,54** claro · **8,15** escuro |
| `--proc-forte` | `#131722` | `#e6e9ef` | `ink` | 4,5 | **15,70** claro · **12,38** escuro |
| `--proc-fraca` | `#57606a` | `#8b949e` | `ink` | 4,5 | **5,60** claro · **4,89** escuro |
| `--acao-fill` | `#131722` | `#333846` | `fill` | ver nota | 15,70 claro · **1,32** escuro ⚠️ |
| `--acao-borda` | (o próprio fill) | `#8b949e` | `ink` | 3,0 | **4,89** escuro |
| `--acao-on` | `#ffffff` | `#e6e9ef` | `on` | 4,5 | 17,90 · **9,62** |
| `--foco` | `#131722` | `#8b949e` | `ink` | 3,0 | 15,70 · 4,89 · **ver §1.8 ⚠️** |

`[MEDIDO: node scripts/validate_palette.js — 361 medições, exit 0]`

> **⚠️ Tarja de 2026-08-25 (3ª revisão): `--dado-quebrado-ink` TROCOU nos dois modos.**
>
> | | era | é | motivo |
> |---|---|---|---|
> | claro | ~~`#6d28d9`~~ (6,23) | **`#581c87`** (9,54) | tritanopia **5,3 ⇒ FAIL** contra `--proc-fraca` |
> | escuro | ~~`#c084fc`~~ (5,70) | **`#e0aaff`** (8,15) | tritanopia **14,7 ⇒ WARN** contra `--proc-fraca` |
>
> Os valores revogados **continuam medidos** no BLOCO 1 do script, para que os números publicados
> reproduzam. Ver §1.4 para o argumento e §1.4-ter para por que **não** adotei o candidato magenta.

⚠️ **Nota sobre `--acao-fill` no modo escuro:** `#333846` sobre `#131722` dá **1,32** — muito abaixo de
3:1. Isso **não** é um defeito: um botão preenchido cujo fill não se separa do fundo tem de ter a
**fronteira carregada pela borda**, e é o que `--acao-borda` `#8b949e` faz (**4,89**). O piso de 1.4.11
recai sobre a **fronteira do componente**, não obrigatoriamente sobre o fill. Está declarado porque um
leitor futuro veria `1,32` e concluiria que reprova.

⚠️ **Correção de um defeito que ninguém havia medido: "tinta fraca" não pode ser cinza claro.**
`MODELADO` é especificado como "tinta fraca", e a escolha natural (`#8b949e` no claro) mede **2,70**
contra `--sup-listra` — **reprova 1.4.3 por larga margem**. `--proc-fraca` é o **piso** do que "fraca"
pode ser: `#57606a` (**5,60**) no claro e `#8b949e` (**4,89**) no escuro. **`opacity: 0.6` sobre tinta
primária está proibido** — é o idioma que produz exatamente esse defeito.

### 1.3 Os pares críticos passam nos DOIS modos — `D5.6` satisfeito

**Um par é *crítico* quando existe região de tela onde os dois podem aparecer no mesmo agrupamento
visual.** Quando não existe, o par é *informativo* e **não gateia** — e a razão de não gatear está
escrita no script, linha por linha, para que ninguém a use como escape genérico.

**Veredito por `min(protan, deutan, TRITAN)`.** Até a 2ª revisão era `min(protan, deutan)`, e a
tritanopia era o falsificador declarado de §1.4. **Ele se realizou** — ver §1.4-bis.

| par crítico | claro min3 | escuro min3 | veredito |
|---|---|---|---|
| `direcao-alta-fill` × `direcao-baixa-fill` | **18,0** | **18,0** | PASS |
| `dado-quebrado-ink` × `direcao-alta-fill` | **31,7** | **26,9** | PASS |
| `dado-quebrado-ink` × `direcao-baixa-fill` | **34,8** | **29,5** | PASS — **era este o par que reprovava** em 2026-08-24 (11,3 / 5,3) |
| `dado-quebrado-ink` × `acao-fill` | **17,4** | **51,8** | PASS |
| `dado-quebrado-ink` × `proc-fraca` | **17,7** | **19,5** | PASS — **era 5,3 / 14,7**. Ver §1.4-bis |
| **`dado-quebrado-ink` × `proc-forte`** | **17,4** | **17,1** | PASS — **par NOVO**: `QUARENTENA` e `OBSERVADO` são as duas palavras da mesma coluna, e ninguém havia medido o par |
| `proc-forte` × `proc-fraca` | **23,4** | **22,5** | PASS |

**O pior par crítico do sistema mede 17,1** (escuro, `quebrado × forte`), com folga de **2,1** sobre o
piso de 15. **Nenhum par crítico fica abaixo do piso sob nenhuma das três dicromacias.**

> **⚠️ Tarja: os números da 2ª revisão eram `min(protan, deutan)` sob Viénot 1999 e todos MUDARAM.**
> Os dois que mudaram por mais de 10 pontos são `dado-quebrado × direcao-baixa` (53,0 → 34,8 no claro) e
> `dado-quebrado × acao-fill` (31,2 → 17,4 no claro) — **em ambos o novo mínimo é o tritan**, que antes
> não era medido. Nenhum deles inverte veredito. O que **inverteu** veredito foi
> `dado-quebrado × proc-fraca`, e é por isso que os dois violetas foram trocados.

### 1.4 Por que VIOLETA para `--dado-quebrado` — a arquitetura de canais, escrita INTEIRA

**Esta seção afirmava metade do argumento. Aqui está a outra metade** — e ela foi apontada pelo gate
como um crédito que eu não havia reivindicado.

Os **dois** canais de hue desta interface falham sob dicromacias **disjuntas**, e **cada um é coberto por
um canal não-cromático DIFERENTE**:

| canal de hue | eixo de cone | morre em | sobrevive em | canal não-cromático que o cobre |
|---|---|---|---|---|
| **direção** verde↔vermelho | **L/M** | **protan** (18,0) e **deutan** (22,8) | **tritan: 61,4** | **FORMA** — vazado / cheio / cruz |
| **integridade** violeta | **S** | **tritan** (era **5,3** — ver §1.4-bis) | **protan** (19,5) e **deutan** (19,5) | **GLIFO + PALAVRA** — losango vazado + `QUARENTENA` |

**Isto não é coincidência: é a arquitetura.** Nenhuma dicromacia derruba os dois canais de hue ao mesmo
tempo, porque eles vivem em eixos de cone diferentes. E **nenhum** deles depende do hue para sobreviver,
porque cada um tem redundância própria, de **espécie diferente** da do outro (forma geométrica no plot;
glifo + texto na tabela). O hue é **acelerador de leitura em visão tricromata**, nunca o portador.

⇒ **é por isso que direção pode viver no eixo perdido por ~8% dos leitores** e integridade não poderia:
não porque uma importa menos, mas porque a redundância de direção (a forma do corpo da vela) é **mais
barata e mais confiável** que a de integridade, que precisa de espaço para uma palavra.

Foi por isso que **âmbar foi rejeitado**: sob dicromacia o vermelho colapsa *para* o amarelo-marrom, e o
projeto já mediu isso — `#d03b3b ↔ #eb6834` = **11,3**. Um alerta âmbar cairia no mesmo buraco.

E foi por isso que **`--acao` NÃO é azul.** Os números **foram corrigidos** — ver §1.4-quater.

⇒ **ação foi movida para o canal de luminância.** Não é estética: é a única saída aritmética depois de
colocar integridade no eixo do cone S.

### 1.4-bis ⛔ O FALSIFICADOR DE §1.4 SE REALIZOU — tritanopia medida, e ela REPROVOU

A 2ª revisão escreveu, contra si mesma:

> ~~*"sob **tritanopia** (eixo S ausente) violeta é a pior escolha possível, e **eu não medi
> tritanopia** `[NÃO MEDIDO]`. (...) Tritanopia é ~0,01% da população contra ~8% de protan+deutan, e o
> canal de integridade tem glifo e texto independentes do hue — mas o número não existe, e por isso está
> marcado."*~~

**Medi. Reprovou. E o argumento de prevalência com que eu me consolei era o argumento errado.**

```
                                                    tritan  protan  deutan   veredito
direcao-alta-fill x direcao-baixa-fill                61.4    18.0    22.8   PASS folgado
dado-quebrado-ink x proc-fraca — CLARO  (#6d28d9)      5.3    21.9    20.1   FAIL  (< 6,75 = piso de WARN)
dado-quebrado-ink x proc-fraca — ESCURO (#c084fc)     14.7    21.2    19.2   WARN
```

É exatamente o par que o **próprio script** rotula *"palavra QUARENTENA x numeral MODELADO na mesma
coluna"*. **Sob tritanopia o violeta colapsa para cinza — e o vizinho dele já era cinza.**

#### Por que o argumento de prevalência não valia

**Não é o critério que o corpo de conhecimento usa.** `typography-color-mastery.md:428` diz protan/deutan
*"first"* — **não** *only*. E tritanopia é **nomeada no conjunto de teste** em três lugares
independentes: `data-visualization-patterns.md:227`, `enterprise-dashboard-patterns.md:81` e
`ui-visual-design-system/SKILL.md:107`. Prevalência é argumento de **priorização**, não de **dispensa**.

E há um segundo motivo, interno a este projeto: **eu havia declarado tritanopia como O falsificador da
decisão.** Uma seção que nomeia o seu falsificador e depois o dispensa por prevalência não tem
falsificador — tem uma nota de rodapé.

#### Por que Viénot 1999 não podia medir isto, e o número que prova

O estimador antigo **superestima tritan sistematicamente**, e medi por quanto:

```
par                        BRETTEL 1997  VIENOT 1999   delta
direcao alta x baixa            61.4        74.9        13.5
quebrado x fraca CLARO           5.3         7.8         2.6
quebrado x fraca ESCURO         14.7        42.6        28.0
```

**Viénot teria APROVADO o par que Brettel reprova** (42,6 contra 14,7 no escuro — de PASS folgado para
WARN). E a **causa raiz está medida**: os três conjuntos de coeficientes publicados por Viénot 1999 são
**exatamente `W × primária AZUL do sRGB`** —

```
protan  L =  2.023442*M - 2.525806*S    (Vienot publica  2.02344  / -2.52581)
deutan  M =  0.494207*L + 1.248272*S    (Vienot publica  0.494207 /  1.24827)
tritan  S = -0.395913*L + 0.801108*M    (Vienot publica -0.395913 /  0.801109)
```

— e para tritanopia isso é **degenerado**, porque a primária azul é **exatamente o eixo que a tritanopia
perde**. Os dois semiplanos reais de Brettel divergem **23×** no coeficiente de `L` (`-0.0026` contra
`-0.0601`). Para protan/deutan é inofensivo: os dois semiplanos quase coincidem (protan 2,168 contra
2,185; deutan 0,4612 contra 0,4576). **É por isso que o próprio artigo de 1999 se restringe a
protan/deutan.** Usar Viénot para tritan não é aproximar — é medir a coisa errada.

#### Verificação cruzada: duas implementações independentes, dez pares, zero divergência

O gate implementou Brettel 1997 por fora. Implementei o meu **derivando os planos em execução**
(`W × âncora espectral`, âncoras 485/660 nm para tritan e 475/575 nm para protan/deutan) em vez de copiar
constante — porque constante publicada vive num espaço LMS específico e **não transporta em silêncio**.

**Os dez pares que as duas implementações mediram concordam:** 61,4 · 5,3 · 14,7 · 17,7 · 26,7 · 17,4 ·
43,4 · 34,8 · 27,6 · 19,0. Protan/deutan concordam dentro de **0,3**. E a derivação **reproduz as
constantes que a libDaltonLens publica** para tritanopia — plano 660 nm `(-0.002592, 0.053691)`, plano
485 nm `(-0.060108, 0.162987)`, e a razão do plano separador `0,52624` contra `0,52623` publicado.
**Cinco casas.** Não é coincidência de recall: é a geometria.

⇒ o veredito do script passou a ser **`min(protan, deutan, tritan)`**.

### 1.4-ter O valor adotado no ESCURO não é o candidato do gate — e o motivo é medido

O gate mediu dois candidatos e foi explícito em **não prescrever o valor**: prescreveu que a medição
exista e que cada par abaixo do piso seja **fechado ou aceito com razão escrita**. Adotei um e recusei o
outro.

**Claro: `#581c87`, que é o candidato do gate. ADOTADO.** Varri onze candidatos e os melhores empatam
dentro de 0,5 ΔE (`#5d1a7a` 17,8 · `#631f8f` 17,7 · `#581c87` 17,4 · `#54187f` 17,3). **Em empate,
prefiro o valor que uma segunda implementação já mediu:** adotar `#5d1a7a` por +0,4 ΔE trocaria
verificação cruzada por ruído.

**Escuro: adotei `#e0aaff` e NÃO `#e879f9`.** Vinte candidatos medidos; **só três** passam o piso de
texto **e** o piso 15 nos quatro pares críticos:

| candidato | matiz | contraste | min3 (pior par) | **cinza vs `proc-fraca`** | ΔE ao `#f23645` em visão NORMAL |
|---|---|---|---|---|---|
| `#e879f9` (o do gate) | **323°** | 6,12 | **18,3** | **1,25 ⛔** | **34,3** |
| **`#e0aaff` (ADOTADO)** | **315°** | **8,15** | 17,1 | **1,66 ✓** | **37,5** |
| `#f0abfc` | 322° | 8,56 | 15,9 | 1,75 ✓ | 36,3 |

**Quatro razões medidas, e a primeira é a preferência `P1` do próprio gate:**

1. **`#e879f9` NÃO entrega `P1`.** O degrau de luminância contra `--proc-fraca` fica em **1,25** — quase
   o mesmo **1,16** do `#c084fc` que estamos trocando. `#e0aaff` entrega **1,66**. Como `P1` e o achado
   de tritanopia têm a **mesma raiz** (a tinta de integridade na posição menos distintiva da coluna), o
   candidato que não move a luminância conserta **metade** do defeito.
2. **Matiz 315° contra 323°.** O violeta que sai é **312°** e o do modo claro é **314°**. `#e0aaff`
   mantém coerência de matiz entre os dois modos; `#e879f9` a quebra em 9–11°, **para o lado do magenta**.
3. **"Vermelho por hábito" é mensurável, e `#e0aaff` fica MAIS LONGE do vermelho:** **37,5** contra
   **34,3** de ΔE2000 em **visão normal** — que é o regime em que o hábito opera. Hábito é fenômeno de
   visão tricromata; medir a distância ao vermelho sob dicromacia responderia outra pergunta.
4. **Contraste 8,15 contra 6,12** contra a pior superfície escura.

**O que isso custa: 1,2 ΔE no pior par** (17,1 contra 18,3). **Aceito**, e o número que justifica é a
folga: **17,1 é 14% acima do piso de 15**.

**E um candidato foi rejeitado por realizar exatamente o risco que o owner nomeou:** `#d946ef` (fúcsia
saturada) mede **12,2** contra `--direcao-baixa-fill` ⇒ **abaixo do piso**. O magenta saturado **colide
aritmeticamente com o vermelho de baixa**. A preocupação de que "magenta reintroduz vermelho" não era só
semântica — **na saturação alta ela é numérica.**

⚠️ **`[NÃO SEI]`, e é a parte que não é aritmética:** se `#e0aaff` (matiz 315°, L\* 77) **lê como
violeta** para o owner, ou lê como "rosa". Matiz e ΔE **não decidem nomeação de cor**, e não há teste com
usuário. É a decisão mais frágil desta rodada — e a mais barata de reverter: é **um** valor de hue, e
re-rodar as 361 medições é **um comando**.

### 1.4-quater ⚠️ Os três pares de "ação não é azul" AGORA TÊM COMANDO — e um deles estava errado

Os três números viviam **publicados no documento sem comando nenhum**. Um número publicado sem comando
não é medição: é memória. Estão agora no BLOCO 1b do script.

| par | publicado antes | Brettel `min3` | veredito |
|---|---|---|---|
| `#1d4ed8` × `#6d28d9` | 0,4 | **0,3** (deutan) | reproduz — **é o número que carrega a decisão** |
| `#3b82f6` × `#a855f7` | 0,8 | **0,7** (deutan) | reproduz |
| `#2a78d6` × `#c084fc` | **6,3** | **9,8** (protan) | ⛔ **ERRADO em ~56%** |

> **⚠️ Acréscimo de 2026-08-25 (4ª revisão): o azul que APARECEU numa tela real mede 0,9, e não
> é nenhum dos três acima.** `[MEDIDO: measure_stitch_drift.sh, BLOCO D4]`
>
> | par | `min3` | veredito | de onde vem |
> |---|---|---|---|
> | **`#a8c8ff` × `#e0aaff`** | **0,9** | ⛔ **FAIL** | o azul que a tela do Stitch usou em **7 lugares** |
> | `#4b91f1` × `#e0aaff` | 11,6 | WARN | a borda do item ativo do rail |
> | `#2a78d6` × `#e0aaff` | 20,3 | PASS | a semente `customColor` do tema |
>
> **O achado que importa não é o `0,9`: é de onde ele veio.** `#a8c8ff` **não foi escolhido por
> ninguém.** É o `namedColors.primary` que o sistema de cor dinâmica do Stitch **derivou** da
> semente `#2a78d6`. E a semente mede **20,3 ⇒ PASS**, enquanto o valor derivado dela mede
> **0,9 ⇒ FAIL**.
>
> ⇒ **medir a semente não mede a paleta.** Um tema pode ter seed aprovada e ainda entregar, na
> tela, um token que reprova por 16× de margem. Esta é a razão pela qual o tema novo usa
> `colorVariant: MONOCHROME` com semente **acromática**: não é preferência estética, é **remover
> a matéria-prima de que a derivação faz hue**.
>
> **E corrige uma atribuição minha:** o §9 ensina *"azul de acao contra violeta de integridade da
> 0.3 sob deuteranopia"*. O `0,3` é de `#1d4ed8 × #6d28d9` — **dois valores que nunca estiveram
> nesta tela**, sendo o segundo um violeta **revogado**. O número **reproduz** e o argumento é o
> mesmo, mas o par que **de fato ocorreu** é `#a8c8ff × #e0aaff` = **0,9**. Mantive o `0,3` no §9
> (ele não está errado) e registro o `0,9` aqui, porque **um exemplo que aconteceu vale mais que
> um exemplo que ilustra**.

> **⚠️ Tarja: o `6,3` que eu publiquei é falso.** O valor correto sob Brettel é **9,8**. O gate mediu
> **9,6** por fora; a diferença de 0,2 é atribuível ao estimador (a minha derivação e a dele divergem em
> até 0,3 em protan). **Nenhuma das duas versões muda a decisão** — o número que a carrega é o **0,3**,
> e ele reproduz: **azul e violeta são a MESMA COR sob deuteranopia.** Mas `6,3` era o terceiro número de
> uma lista de três, e uma lista em que um terço está errado por metade não é evidência: é ornamento.
> **Este é o defeito de forma que gerou a regra nova:** todo número publicado neste documento tem de
> existir dentro do script.

### 1.4-quinquies PROCEDÊNCIA COMO TINT DE COR — o argumento aritmético que faltava a `D15`

**Até esta revisão, `D15` ("procedência não consome hue") era justificada por ESCASSEZ:** o
orçamento de hue tem 3 vagas e 3 ocupantes, logo não sobra vaga. **É um argumento de alocação, e
ele não diz nada sobre se o tint funcionaria se houvesse vaga.**

Agora diz. O `designMd` que o Stitch tinha em vigor prescrevia três tints pastel para os três
níveis de procedência — `#93c5fd` (OBSERVADO), `#c4b5fd` (DERIVADO), `#99f6e4` (MODELADO). Medi
os três. `[MEDIDO: bash scripts/measure_stitch_drift.sh, BLOCO D5]`

| par | `min3` | veredito |
|---|---|---|
| `#93c5fd` × `#c4b5fd` — **os dois primeiros níveis entre si** | **0,5** | ⛔ **FAIL** |
| `#93c5fd` × `#99f6e4` | 9,1 | WARN |
| `#c4b5fd` × `#99f6e4` | 17,4 | PASS |
| `#93c5fd` × `--dado-quebrado-ink` `#e0aaff` | **1,1** | ⛔ **FAIL** |
| `#c4b5fd` × `--dado-quebrado-ink` `#e0aaff` | **0,6** | ⛔ **FAIL** |
| `#99f6e4` × `--dado-quebrado-ink` `#e0aaff` | 17,7 | PASS |

**Duas reprovações independentes, e a segunda é pior que a primeira:**

1. **O tint não separa os próprios níveis.** `OBSERVADO` e `DERIVADO` — os dois valores mais
   frequentes da coluna — medem **0,5** entre si. São **a mesma cor** sob dicromacia. Um canal
   que não distingue os seus próprios estados não é canal; é decoração.
2. **O tint INVADE o canal de integridade.** Dois dos três medem **1,1** e **0,6** contra
   `#e0aaff`. Ou seja: para um observador dicromata, o badge que diz *"este número é derivado"*
   e a tinta que diz *"este número quebrou"* **são a mesma cor** — e essas duas afirmações
   convivem literalmente na mesma linha do cabeçalho de painel.

⇒ **`D15` deixa de ser uma decisão de orçamento e passa a ser uma decisão de aritmética.** Mesmo
se houvesse uma quarta vaga de hue, **procedência-como-tint reprovaria**. O ramp em vigor, sem
hue nenhum, mede `#e6e9ef × #8b949e` = **22,5** com razão de luminância **2,53** — separa os
níveis **e** não toca a integridade.

⚠️ **Onde este argumento NÃO alcança:** ele mede os **três tints específicos** que o Stitch
prescrevia, não *todo* esquema de tint concebível. **`[NÃO SEI]`** se existe um trio de hues que
separe entre si por >15 **e** de `#e0aaff` por >15 **e** passe 4,5:1 como texto. **Não varri o
espaço.** O que está provado é mais estreito e mais útil: **o trio que um gerador escolhe por
default reprova**, e reprova pelo pior motivo possível.

### 1.5 O NUMERAL TINGIDO — a colisão que a auditoria deixou aberta

A auditoria escreveu: *"a colisão real que sobra é numeral tingido: um `cvd_delta` negativo em vermelho
ao lado de um numeral quebrado em vermelho, na mesma coluna."*

**Discordo do enquadramento: a colisão não sobra. Ela é impossível por construção,** e o caminho para
isso já estava na medição da própria auditoria, sem que ela o tivesse conectado à sua pergunta.

`DESIGN_SYSTEM.md` §0.4 já havia concluído, por contraste e não por princípio: *"`#2a78d6` não alcança
4,5:1 em NENHUMA das cinco superfícies. ⇒ **cor de direção nunca tinge glifo, só preenchimento de
forma.**"* Confirmado nos valores novos: `--direcao-alta-fill` mede **3,13** no pior caso claro — legal
para forma (3:1), **ilegal para texto** (4,5:1). **Não é uma escolha: é o que a norma permite.**

> **⚠️ A atribuição de superfície importa, e o §9 a errou.** Os três números de `#089981` no modo claro
> são: **3,57** contra `--sup-base` `#ffffff` · **3,36** contra `--sup-chrome` `#f7f8fa` · **3,13** contra
> `--sup-listra` `#eff0f2`. **`3,13` é contra a LISTRA, não contra o branco.** O `3,13` desta seção está
> certo porque diz "pior caso"; o **§9 de `STITCH_CONTEXT.md` dizia *"contra branco dá apenas 3.13:1"*, e
> isso é falso** — contra branco dá **3,57**. Corrigido no §9 nesta rodada.
>
> **A conclusão não muda** (3,57 e 3,13 são ambos < 4,5 ⇒ ilegal para texto nos três casos), mas o §9 é
> **o artefato mais copiado deste repositório** e é justamente aquele que afirma *"isto foi medido"*.
> Errar a superfície num artefato assim propaga a suspeita para os números que estão certos.

⇒ **Regra, e ela fecha as duas pontas:**

```
o NUMERAL tem UM ÚNICO eixo de tinta: o ramp de PROCEDÊNCIA (--proc-forte / --proc-fraca).
Esse ramp NÃO TEM HUE.
Direção nunca tinge numeral. Integridade nunca tinge numeral.
```

**Então como se lê o sinal de um delta?** Por **três** canais, nenhum deles hue:

1. **O caractere de sinal, sempre presente.** `+1.234` e `−1.234`. O `+` **não é opcional** — a sua
   ausência é que criaria ambiguidade. Com `font-variant-numeric: tabular-nums` em fonte monoespaçada,
   o sinal ocupa **coluna fixa**: varrer a coluna com o olho lê os sinais como um padrão vertical, sem
   ler número nenhum. Isto é **mais rápido** que hue, não menos — e é o que
   `skills/desktop-app-design/SKILL.md` chama de *"information density with clarity — Tufte:
   maximize data-ink ratio"*.
2. **A geometria do plot.** Posição em relação à linha de base zero. `cvd_delta` é `nature = FLOW` e é
   desenhado como barra a partir do zero: acima ou abaixo é a leitura primária.
3. **Mini-barra na célula (`sparkbar`), opcional.** Uma barra **é forma**, não glifo ⇒ pode usar
   `--direcao-*-fill` sob o piso de 3:1. É aqui, e só aqui, que hue de direção entra numa tabela.

**E como se lê "este número está quebrado"?** Por **três** canais, e o hue é o terceiro:

1. **Glifo:** **losango vazado**, sempre o mesmo, **nunca triângulo nem círculo** (essas duas formas
   pertencem a severidade de dashboard e trariam vermelho de volta por hábito). **A forma sozinha tem de
   bastar em escala de cinza.**
2. **Texto:** a palavra — `QUARENTENA`, `idade ?`, `sem procedência`. Sobrevive a `forced-colors`, a
   leitor de tela e a captura de tela em cinza.
3. **Hue:** `--dado-quebrado-ink` no **traço do losango** e na **régua vertical do selo**. **Acompanha.
   Nunca porta.**

O numeral em si, quando é exibido apesar de suspeito (caso `STOCK` obsoleto do §3), aparece em
`--proc-fraca` **mais o texto explícito** `de hh:mm:ssZ (−Xm)`. Tinta neutra, afirmação em palavra.

**`critical` continua FORA do canal de cor (`CA-F4-10`), e agora há QUATRO argumentos independentes:**
escassez de canal · `forced-colors: active` (onde só glifo e texto sobrevivem) · o contraste medido ·
e **tritanopia não medida**, que é a razão pela qual o hue de integridade **não pode** ser o portador.

### 1.6 A colisão que EU introduzo, e que declaro em vez de esconder

`HUMANO = contorno` (§2) e `corpo VAZADO = alta` (§0.3) usam **os dois o canal de forma "sem
preenchimento"**. Isso é o começo de um cruzamento de papéis, que é exatamente o defeito que a validação
existe para pegar.

**Resolução, e é a mesma lógica de escopo por tipo de marca:** são operações visuais diferentes sobre
classes de objeto disjuntas.

| papel | operação | classe de objeto |
|---|---|---|
| direção | **interior esvaziado** dentro do próprio contorno da forma | **corpo de vela**, no plot |
| `HUMANO` | **halo adicionado por fora**, deslocado da forma | **marca de anotação**, na camada de overlay |

Vela nunca é anotação; anotação nunca é vela. Por isso o §9 passa a dizer **`HUMANO` = halo/contorno ao
redor da marca** — a palavra "contorno" está preservada, e ganhou o qualificador que a desambigua.

⚠️ **Este é o ponto mais fraco de tudo que eu decidi hoje, e é onde eu apostaria que estou errado.**

> **⚠️ O falsificador desta seção FOI TROCADO em 2026-08-25 (3ª revisão), e o antigo está tarjado
> abaixo — porque ele era infalsificável na prática.**
>
> ~~*"Falsificador: se numa tela real um analista lê uma vela vazada como 'anotada por mim', o escopo por
> classe de objeto não se sustenta. `[NÃO MEDIDO]` — não há teste com usuário, e com um único usuário
> não haverá amostra."*~~
>
> **Eu mesmo admiti que N=1 não produz amostra — ou seja, escrevi um falsificador que declarei incapaz
> de ser executado.** Uma seção auto-declaradamente infalsificável é **pior** que uma com falsificador
> fraco: ela parece ter gate e não tem.

**FALSIFICADOR NOVO, e ele é de GEOMETRIA, mensurável hoje, sem usuário nenhum:**

```
A camada de overlay chega a posicionar um `swing_point` com halo a menos de N px do
contorno de uma vela VAZADA, em zoom tipico?
```

**Por que este é executável e o antigo não era:** a medição vive inteira em `charts`, que por `FR-1`
(`ADR-003:36`) *"não faz I/O. Zero `fetch`, zero rota, zero `localStorage`. Toda entrada é argumento"* ⇒
roda numa **página estática, com pontos sintéticos, zero rede, zero API key, zero dependência de fase**.
É o mesmo formato da medição que `tasks_review.md` §7/**D-2** já argumenta que devia rodar antes das 16
tasks de `charts`, e não depois.

**Critério de reprovação:** se a distância mínima entre um halo de anotação e o contorno de um corpo
vazado, no zoom em que a S2-mínima é lida, cair abaixo do limiar em que as duas formas ficam
visualmente contíguas, **o escopo por classe de objeto não se sustenta** e a redundância de direção tem
de mudar de canal (candidatos: espessura de pavio, ou tick lateral de fechamento).

⚠️ **`[NÃO SEI]` qual é o `N`.** Não tenho base para fixar o limiar em px sem medir a distância de
separação percebida no DPI e no zoom reais. **Não vou inventar um número para parecer preciso** — o que
esta seção passa a ter é um **procedimento executável e um critério de forma**, com a constante marcada
como faltante. A dívida saiu de "não é mensurável" para "o limiar não está medido", e essas duas coisas
não têm o mesmo custo.

**O falsificador antigo não foi apagado: ele foi rebaixado a *sintoma*.** Se um analista relatar a
confusão, isso continua sendo evidência — o que ele não pode mais ser é o **único** gate.

### 1.7 Cor como token nomeado por papel — e o número real de tokens

Nunca `--red-500`. Sempre `--direcao-baixa-fill`, `--dado-quebrado-ink`, `--proc-fraca`.

> **⚠️ Correção da afirmação de §1.2 da emissão anterior.** Ela dizia: *"trocar o esquema é trocar
> **2 tokens**"*. **Falso.** A auditoria propôs **16** (papel 4 × modo 2 × variante 2) — **também
> falso**, porque a matriz não é uniforme: alguns papéis não têm variante de texto *de propósito*, e
> alguns valores são compartilhados entre modos.
>
> **Contado pelo script:**
>
> ```
> BLOCO 7 — CONTAGEM REAL
>   tokens de cor declarados (papeis + superficies, 2 modos): 25
>   valores que carregam HUE: 4  (#089981 #f23645 #581c87 #e0aaff)
>   medicoes executadas nesta rodada: 361
> ```
>
> ⇒ **25 tokens; 4 valores carregam hue; 361 medições para revalidar.** A afirmação correta é:
> **trocar o esquema é trocar 4 valores e re-rodar 361 medições. Barato em edição, caro em validação —
> e é a validação que decide.** `Q13` continua não gateando, mas por um motivo mais honesto: não porque
> a troca é trivial, e sim porque ela é **mecânica e verificável por comando**.
>
> **⚠️ Tarja: a 2ª revisão publicou `120 medições` e os hues `#6d28d9 #c084fc`.** As duas coisas
> mudaram: os violetas foram trocados (§1.2) e a contagem subiu de 120 para **361** porque a 3ª revisão
> acrescentou **tritanopia** (+1 tipo de dicromacia em **todo** par), o par crítico `quebrado × forte`,
> e cinco blocos novos: **BLOCO 0** (os dois estimadores lado a lado), **BLOCO 1b** (os pares
> azul×violeta, que eram números publicados sem comando), **BLOCO 1c** (a varredura de candidatos a
> `--dado-quebrado-ink`, adotados **e** rejeitados), **BLOCO 4b** (adjacências de fronteira) e
> **BLOCO 6b** (colapso em cinza das tintas de coluna). **O número de tokens não mudou: continua 25.**
>
> **O maior contribuinte é o BLOCO 1c**, e isso é deliberado: ele mede **nove candidatos** — os dois
> adotados, os cinco rejeitados e os dois revogados — porque a regra que §1.4-quater estabelece é que
> **todo número publicado neste documento tenha de existir dentro do script**. Publicar a tabela de
> candidatos e deixar a varredura fora do comando seria reproduzir, na mesma rodada, o defeito que
> §1.4-quater acabou de corrigir.

---

### 1.8 ⛔ `--foco` era BYTE-IDÊNTICO ao token que ele encosta — e a resolução é GEOMETRIA, declarada

**O defeito, medido:**

```
escuro:  --foco #8b949e  ==  --acao-borda #8b949e   ⇒  contraste 1.00
claro:   --foco #131722  ==  --acao-fill  #131722   ⇒  contraste 1.00
```

**O anel de foco é desenhado imediatamente adjacente à borda do próprio botão. A fronteira não existe.**

**Por que isto passou pela 2ª revisão, e a assimetria é o achado real:** `--foco` foi medido **contra
SUPERFÍCIE** (15,70 no claro, 4,89 no escuro) e **nunca contra o token que ele toca**. E o caso
rigorosamente análogo eu **peguei e declarei** — a nota de `--acao-fill` `1,32` no escuro, com o
argumento de que *"o piso de 1.4.11 recai sobre a fronteira do componente, não obrigatoriamente sobre o
fill"*. **Passei por este.** O defeito não era de aritmética: era de **cobertura**. O script não tinha
bloco para *"dois tokens desenhados um encostado no outro"*.

**RESOLUÇÃO DECLARADA — e é declaração, não isenção:**

```
o anel de foco e DESLOCADO (outline-offset > 0).
o VAO entre o anel e a borda do botao e COR DE SUPERFICIE.
a fronteira que SC 1.4.11 exige passa a ser anel<->vao E borda<->vao, e as DUAS sao medidas.
```

| modo | anel | vão | anel ↔ vão | borda/fill ↔ vão |
|---|---|---|---|---|
| escuro | `#8b949e` | `--sup-base` `#131722` | **5,82** | **5,82** |
| escuro | `#8b949e` | `--sup-chrome` `#0d1017` | **6,19** | **6,19** |
| escuro | `#8b949e` | `--sup-listra` `#222634` | **4,89** ← pior caso | **4,89** |
| claro | `#131722` | `--sup-base` `#ffffff` | **17,90** | **17,90** |
| claro | `#131722` | `--sup-listra` `#eff0f2` | **15,70** ← pior caso | **15,70** |

**Pior vão: 4,89 contra piso 3,0 ⇒ PASS.** A sequência lida é **três faixas** — borda, vão de superfície,
anel — e cada transição passa 1.4.11.

> **⚠️ ESTE `PASS` DEPENDE DE GEOMETRIA, NÃO DE COR, e é a coisa mais importante desta seção.** Se o anel
> for desenhado **colado** na borda (`outline-offset: 0`), o veredito real é o **`1,00` do topo** e
> **reprova**. ⇒ `outline-offset` **não é preferência de estilo: é requisito de acessibilidade**, e o
> BLOCO 4b do script imprime o valor direto ao lado do valor com vão para que ninguém leia só o segundo.
>
> **`[NÃO SEI]` qual valor de `outline-offset` em px.** O vão tem de ser largo o bastante para ser
> percebido como faixa, e isso depende de DPI e de zoom. Não medi. **A regra é "deslocado e medido";
> a constante está faltando.**

**Consequência para o script:** `foco × acao-borda` e `foco × acao-fill` entraram no BLOCO 4b como
adjacências **críticas**. Antes desta rodada, nenhum par de tokens *adjacentes* era medido — só
token↔superfície.

### 1.9 ⛔ O DOJI — quando `open == close` a redundância de forma DESAPARECE

**O defeito, e ninguém o havia visto.** O canal de forma da direção é *"corpo vazado"* contra *"corpo
cheio"*. Quando `open ≈ close` o corpo tem **~1 px** e **não há interior para esvaziar**: vazado e cheio
ficam graficamente idênticos. ⇒ nesse candle específico a direção passaria a ser carregada **só por hue**,
que é exatamente a violação de **SC 1.4.1** que §0.3 existe para impedir. E o hue colapsa em cinza a
**1,092**.

**Duas saídas possíveis. Adotei a segunda, e o motivo é que a primeira MENTE.**

| saída | o que faz | por que |
|---|---|---|
| altura mínima de corpo (2–3 px) | força um corpo desenhável e mantém vazado/cheio | ⛔ **REJEITADA** |
| **doji é DIRECIONALMENTE AMBÍGUO POR DEFINIÇÃO** | o doji é um **terceiro estado da forma**, e ele não afirma direção | ✅ **ADOTADA** |

**Por que rejeitei a altura mínima:** um corpo de 2–3 px **afirma** `close > open` ou `close < open` com
uma forma que o dado **não sustenta** — quando `open == close`, nenhuma das duas afirmações é verdadeira.
Isso é a mesma classe de defeito que este projeto persegue em toda parte: **`LOCF` em série `FLOW`,
lacuna preenchida em silêncio, denominador inventado para série de tick.** Forçar geometria para
preservar um canal binário é **inventar informação** para não admitir ausência dela. Num produto cujo job
é *"impedir que um número sem procedência chegue a uma decisão"*, essa troca não se faz.

**A saída adotada, e ela não custa nada:**

```
corpo VAZADO  =  close > open        "fechou acima da abertura"
corpo CHEIO   =  close < open        "fechou abaixo da abertura"
CRUZ / doji   =  close == open       DIRECAO NAO AFIRMADA
```

**A forma não desapareceu: ela mudou de valor.** Um doji é uma **cruz** — sem corpo, só pavio — e é
inconfundível contra um corpo vazado **e** contra um corpo cheio, em escala de cinza, sem cor nenhuma.
O terceiro estado é a leitura correta: *"abriu e fechou no mesmo lugar"*. É também a leitura clássica de
candlestick, anterior à cor.

⇒ **e é isto que fecha 1.4.1:** o hue do corpo de 1 px de um doji **não carrega informação nenhuma**,
porque a forma já afirmou "não sei / não houve direção". Nada se perde quando o hue não está disponível.

⚠️ **O que isto exige do renderizador, e é `[NÃO MEDIDO]`:** `lightweight-charts` decide a cor do corpo
pelo seu próprio critério, e **não** sabe do terceiro estado. **`[NÃO SEI]`** se ele expõe o predicado
`open == close` para que `charts` desenhe a cruz de forma neutra, ou se o corpo de 1 px vai sair tingido
de verde ou vermelho de qualquer jeito. **Se sair tingido, é cosmético e não informativo** — mas
precisa ser verificado, porque a diferença entre "o hue não informa" e "o hue informa errado" é a
diferença entre esta seção estar certa e estar errada. É a mesma medição em `charts` do falsificador de
§1.6, e roda na mesma página estática.

⚠️ **E há um segundo `[NÃO SEI]`: qual é o limiar de `open == close`.** Em dado real a igualdade exata é
rara; o que existe é `|close − open| < tick_size`. **O limiar tem de ser o `tick_size` datado do
instrumento** (`ADR-007` já carrega `tick_size`/`price_precision` datados), **não** um épsilon escolhido
pelo desenhista. Não medi qual fração de barras de 15m do corpus cai nesse regime.

---

## 2. O selo — 4 campos, e nenhum numeral renderiza sem ele

**Visível sem hover. Tooltip não conta.** `[SPEC-001 §6.1]`

| campo | conteúdo | erro que ele existe para impedir |
|---|---|---|
| **série** | rótulo lido **do catálogo**, com qualificador e unidade: `OI · grade 5m · BTC · bn-dump` | as strings `OI`, `funding`, `L/S`, `CVD` **sozinhas não existem nesta UI**. Pedir "o OI" sem `reduction` é erro, nunca default |
| **idade** | `tempo_de_referência − available_at`, **só na borda direita do tempo** | `idade ?` quando `lag_ms` não foi medido. **Um gráfico de 3 dias tem ZERO carimbos de idade, e isso está certo** |
| **procedência** | `OBSERVADO` / `DERIVADO` **com a expressão** / `MODELADO` / `HUMANO` | `DERIVADO` **não é** `MODELADO`. Classificar função determinística como modelada faz o painel nascer permanentemente tracejado, e canal sempre ligado não carrega informação |
| **completude** | `285/288 · 1 lacuna` para série de grade · `contiguidade (N saltos de agg_id)` para série de tick | série de tick **não tem `n_expected`** — exibir `x/y` ali seria inventar denominador |

### 2.1 Içamento — o mecanismo de custo, e ele é contratual

| nível | carrega | frequência |
|---|---|---|
| **sessão** | fuso · `agora` · modo `AO VIVO`/`COMO EM T` · versão do bundle · `env` · `principal_id` | 1× por tela |
| **painel** | `SeriesKey` · fonte · unidade · denom · procedência · `label_shift` · universo · `n lido / n esperado` | 1× por painel — **sempre visível, NUNCA em tooltip** |
| **número** | só a **idade** | por ponto |

**Medido:** envelope completo por célula custa **519 B contra 54 B (9,6×)** — na tela de 570×6, **1.733 KB
contra 180 KB**. E o mesmo `SeriesKey` repetido por célula é afirmado **3.420 vezes por tela**, o que não
é informação.

---

## 3. Ausência — política por `nature`, não por painel

```
SEM_PONTO · NAO_LIDO · QUARENTENA · SEM_FONTE     — quatro classes, quatro tratamentos
```

| caso | tratamento |
|---|---|
| `nature = FLOW` ausente (ex.: `cvd_delta`) | **`—`**. `LOCF` aqui é **erro de tipo**, não escolha de UX |
| `nature = STOCK` com último valor válido (ex.: OI) | valor em **tinta secundária** + `de hh:mm:ssZ (−Xm)` + **linha-guia apontando para trás** até a marca real |
| zero **legítimo** do fornecedor | **marca desenhada na linha de base**, distinguível de ausência em **100 ms** |
| `available_at IS NULL` (quarentena) | a série **não sincroniza painel**. Invariante: `count(painéis sincronizados ∩ quarentena) == 0` |

**A distinção zero-legítimo × ausência não é sutileza.** A Coinalyze devolve **361 buckets com `s = 0`
literal** onde o `daily` reporta 289,65 / 154,53 / 4.547,61 BTC — sem essa distinção a tela afirma "não
houve liquidação" onde o correto é **"não sabemos"**.

---

## 4. Numeral — invariante de locale

```
numeral em QUALQUER caminho de dado  ⇒  ponto decimal, sem separador de milhar
pt-BR aplica-se EXCLUSIVAMENTE a microcopy e rótulo de eixo
```

**Teste:** exportar o mesmo fixture com `LANG=pt_BR.UTF-8` e `LANG=C`, comparar `sha256sum` — **iguais,
ou reprova**. Fixture que não é byte-estável não é fixture; é uma opinião com hash.

---

## 5. Afordância — o que a tela deliberadamente NÃO tem

**Zero seleção é informação.** A tela **não empurra** o owner na direção de mais disparos num instrumento
que gasta capital dele. **Nenhum nudge para baixar o limiar. A ausência da afordância é a afirmação mais
forte disponível.**

Também não existem, e cada um por um motivo escrito em [`PRD-001` §12](../specs/PRD-001-plataforma-dados.md):
gerenciador de presets (o bundle **é** a URL, não um CRUD) · painel de liquidação · watchlist
multi-símbolo ao vivo · dashboard de métricas financeiras · tela de curadoria de alias.

---

## 6. Interação de gráfico

- `pointer_mode ∈ { read, annotate }` **declarado desde já**, com camada de overlay reservada **acima do
  plot e abaixo do crosshair**.
- `clique` / `Espaço` só significam "travar crosshair" em `read`.
- O primeiro primitivo de anotação é **`swing_point`**, não `zone`.
- **A grade canônica é UMA função**, dona de `charts`; o motor a **importa**. Duas implementações da grade
  é o modo de falha em que a tela e o motor discordam sobre o que aconteceu.

### 6.1 Discovery de componente — `@shadcn/chart` foi procurado e **rejeitado**

| item procurado | resultado | decisão |
|---|---|---|
| `@shadcn/chart` | `registry:ui`, dependência **`recharts@3.8.0`** | **REJEITADO.** `ADR-003` põe geometria em `charts` sobre `lightweight-charts`; adotar Recharts seria um **segundo motor de gráfico** e violaria `D5.9` (*"a grade tem UMA implementação"*, `sha256` da projeção canônica igual). O candle vazado/cheio é **configuração do `lightweight-charts`**, não componente React |
| `@shadcn/badge` | `registry:ui`, dependência `radix-ui` | **candidato** para o chip do selo e para o chip de `env` do chrome — **desde que** as variantes de cor sejam substituídas pelos tokens de §1.2. As variantes padrão (`destructive` = vermelho) **violam** D11/D13 e têm de ser removidas, não sobrescritas |
| `components.json` | **não existe** neste repositório | ⇒ nenhum componente pode ser **instalado** ainda. Discovery é registro de intenção, não de instalação. `[MEDIDO: mcp shadcn get_project_registries → vazio, reconfirmado 2026-08-25]` |
| **anel de foco** (§1.8) | `search_items_in_registries("focus ring outline offset")` → **nenhum item** | **não existe componente para isto, e não deveria:** anel de foco é **token + `outline-offset`**, não componente React. O que existe no `@shadcn` é o *utility class* `focus-visible:ring-*` embutido em cada primitivo — e é justamente ele que **precisa ser auditado**, porque o default do Tailwind usa `ring-offset` com a **cor do fundo do tema**, não com a superfície declarada em §1.2. `[MEDIDO: registro vazio, busca sem resultado]` |
| **candle vazado / doji** (§1.9) | não procurado no `@shadcn` | é **configuração do `lightweight-charts`**, não componente. Mesmo motivo que rejeitou `@shadcn/chart` |
| `components.json` / registries | **RECONFIRMADO 2026-08-25 (4ª revisão)** | `get_project_registries` → **lista vazia** · `search_items_in_registries("badge chip status indicator")` → **nenhum item**. ⇒ nada instalável, e a busca por componente **não retorna nem o `@shadcn/badge`** porque sem `components.json` não há registro configurado para consultar. **Discovery continua sendo registro de intenção.** `[MEDIDO: mcp shadcn, 2026-08-25]` |


---

## 7. Atribuição — obrigação de produto, não rodapé opcional

`lightweight-charts` é Apache-2.0 **e a doc exige creditar a TradingView como criadora numa página
pública**, com a notice do arquivo `NOTICE` e link para `tradingview.com`. `[MEDIDO no npm + DOC]`
**Nasce na primeira tela**, não na última.

---

## 8. `[NÃO MEDIDO]` — o que este documento ainda não sabe

| item | estado em 2026-08-25 (**3ª** revisão) |
|---|---|
| ~~dark mode~~ | **RESOLVIDO.** O ramp escuro existe, tem superfícies declaradas e passa `D5.6` nos dois modos. `[MEDIDO: validate_palette.js]` |
| ~~superfícies~~ | **RESOLVIDO.** 3 por modo, declaradas em §1.2 |
| ~~"trocar = 2 tokens"~~ | **CORRIGIDO.** 25 tokens, 4 com hue, **361** medições (§1.7) |
| ~~**tritanopia**~~ | **RESOLVIDO, E ELA REPROVOU.** Brettel 1997 implementado com planos derivados em execução; o veredito é `min(protan, deutan, tritan)`; **os dois violetas foram trocados**. §1.4-bis |
| ~~`--foco` medido só contra superfície~~ | **RESOLVIDO.** Era **1,00** contra o token que ele encosta. Resolvido por **anel deslocado**, declarado e medido: pior vão **4,89**. §1.8 |
| ~~doji sem redundância de forma~~ | **RESOLVIDO por declaração.** Terceiro estado: **cruz = direção não afirmada**. §1.9 |
| **`forced-colors: active`** | **`[NÃO MEDIDO]`, e a premissa anterior estava INVERTIDA para o plot** — ver a caixa abaixo |
| **`prefers-contrast: more`** | **`[NÃO MEDIDO]`** |
| **acromatopsia** (monocromacia de bastonete) | **`[NÃO MEDIDO]` como simulação.** BLOCO 6 e 6b são **proxy por luminância**, e proxy não é simulação. Declarado no rodapé do script |
| **`outline-offset` em px** (§1.8) | **`[NÃO SEI]`.** A regra é "deslocado e medido"; a constante depende de DPI e zoom e não foi medida |
| **limiar de doji** (§1.9) | **`[NÃO SEI]`.** Tem de ser o `tick_size` datado (`ADR-007`), não um épsilon do desenhista. Fração de barras nesse regime: não medida |
| **`#e0aaff` lê como violeta ou como rosa?** | **`[NÃO SEI]`.** Matiz e ΔE não decidem nomeação de cor. §1.4-ter |

> ### ⛔ `forced-colors: active` — a premissa deste documento estava INVERTIDA para o PLOT
>
> ~~*"Nenhuma cor deste documento sobrevive lá. O que sobrevive é glifo + texto."*~~
>
> **Para o CHROME isso é verdade.** Chrome é CSS, e `forced-colors: active` **sobrescreve cor de CSS**.
>
> **Para o PLOT é o OPOSTO, e é pior que o cenário que eu assumi.** [`ADR-003`](../adr/ADR-003-fronteira-charts-web.md)
> põe a geometria em `lightweight-charts`, que desenha em **`<canvas>`**. O modo de alto contraste do
> Windows **sobrescreve cor declarada em CSS e NÃO afeta bitmap de canvas**. ⇒ o resultado em HCM não é
> degradação graciosa: é **HÍBRIDO DESCASADO** — as velas **mantêm** verde/vermelho enquanto **todo o
> chrome ao redor vira cor de sistema**.
>
> **Isso muda o remédio, não só o diagnóstico.** Eu havia usado `forced-colors` como o **4º argumento
> independente** para `critical` viver fora do canal de cor (`CA-F4-10`), com a lógica *"lá só sobrevive
> glifo e texto"*. **O argumento continua válido, mas por um motivo diferente e mais forte:** não é que a
> cor desapareça — é que **metade da tela perde a cor e a outra metade não**, e um canal de cor que só
> funciona em metade da superfície é pior que um canal de cor que não funciona.
>
> **O gancho já existe, e é contratual:** `FR-1` (`ADR-003:36`) — *"**`charts` não faz I/O.** Zero
> `fetch`, zero rota, zero `localStorage`. **Toda entrada é argumento**"*. ⇒ **paleta como argumento**
> permite `web` detectar `forced-colors` e passar `CanvasText` / `Canvas` para `charts`, que desenha o
> canvas com as cores do sistema **sem saber que existe um media query**. A fronteira que `ADR-003`
> desenhou por outro motivo resolve este caso de graça.
>
> ⚠️ **`[NÃO SEI]` se o owner usa Windows, e `[NÃO SEI]` se ele usa HCM.** A plataforma é single-user e
> essa resposta muda a prioridade **por completo**: se ele não usa, isto é dívida de robustez futura; se
> usa, é defeito ativo na única tela que existe. **É uma pergunta de uma linha para o owner**, e está
> registrada como tal em vez de eu estimar.
| **o piso `ΔE >= 15`** | **continua sem procedência normativa.** Adotado pelo script, declarado no script. `D5.6` tem de fixar **script E piso** juntos — dívida carregada para a fase `05` |
| tipografia | **parcialmente decidido:** `font-variant-numeric: tabular-nums` em fonte monoespaçada é **obrigatório** para todo numeral (§1.5 depende disso: o sinal em coluna fixa). Família e escala: **não escolhidas** |
| espaçamento, raio, elevação | não medidos. Densidade **analítica**: linha ~32px, secundário 12-13px, sem card espaçado, sem sombra. `[NÃO MEDIDO]` |
| **o eixo aguenta 288 pontos + 1.440 candles?** | **MAIOR RISCO TÉCNICO da especificação.** Teste: coordenadas X contra os `event_time` originais, tolerância **0,5 px** |
| **leitura do vazado/cheio por usuário real** | **`[NÃO MEDIDO]` e não mensurável com N=1.** É o falsificador de §1.6 |
