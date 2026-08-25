# ADR-010 — Governança de cor por TIPO DE MARCA, e a revogação de "vermelho = dado quebrado"

**Data:** 2026-08-25 · **Status:** **ACEITO pelo owner em 2026-08-25** (declaração literal: *"podemos ... aprovar a ADR"*) · **SPEC:** [`SPEC-001`](../specs/SPEC-001-plataforma-dados.md) §6.2 — **esta ADR a SUPERSEDE**
**Fase/Epic:** `05` (`T-05.7`, `D5.6`) · `CST-3` · **Componente alvo:** `docs`
**Comando de verificação:** `node scripts/validate_palette.js` — **361 medições, exit 0, nos dois modos, sob as três dicromacias**
**Origem:** declaração do owner em 2026-08-25 + o gate `ux-ui-mastery` (`APROVADO COM CONDIÇÃO`, 8 condições)

> **Por que uma ADR e não uma edição de documento.** `SPEC-001` §6.2 é normativo e o ledger está
> **`SPEC_APPROVED`** (`approve spec` em `2026-08-25T18:44:21Z` `[MEDIDO: tasks_review.md:16]`). Editar
> o texto de uma SPEC aprovada para trocar uma decisão é reescrever a decisão do owner sem o gate dele.
> **Uma ADR que supersede §6.2 é o instrumento correto:** a decisão fica registrada com contexto,
> alternativas e falsificador, e a edição em `SPEC-001` passa a ser **correção de citação**, não mudança
> de decisão. As edições preparadas estão em §5 e **não foram aplicadas**.

---

## Contexto

### O que `SPEC-001` §6.2 diz hoje, e é o que cai

`SPEC-001:542`, ainda normativo:

> *"**Nesta plataforma, vermelho significa "o dado quebrou".** Paleta com **4 papéis simultâneos** passa
> validação nos dois modos, com **`critical` fora do canal de cor**. Medido: `#2a78d6 ↔ #eb6834` **PASS**
> (protan ΔE 24,7/26,8) · `#008300 ↔ #e34948` **WARN** (7,2/8,6) · `#d03b3b ↔ #eb6834` **FAIL** (ΔE 10,8,
> abaixo do piso 15) `[MEDIDO]`. (...) `Q13` deixa de gatear e vira preferência trocável (trocar o
> esquema = trocar 2 tokens)."*

**Três afirmações nessa linha estão erradas, e cada uma por um motivo diferente:**

| afirmação | estado | por quê |
|---|---|---|
| "vermelho significa o dado quebrou" | **REVOGADA por declaração do owner** | ver abaixo |
| os três números (24,7/26,8 · 7,2/8,6 · 10,8) | **NÃO REPRODUZEM** | foram calibrados contra um estimador que nunca foi declarado. `validate_palette.js` não existia quando `D5.6` o nomeou como comando |
| "trocar o esquema = trocar 2 tokens" | **FALSA** | contado por comando: **25 tokens**, **4 valores com hue**, **361 medições** para revalidar |

### A declaração do owner, literal

> *"n ter o vermelho tbm foi super estranho, concordo. Ainda teriamos que reensinar o usuário sobre algo
> que é difundido. E sim, utilizo muito o tradingview."*

Isso **realiza o falsificador que a própria auditoria anterior havia nomeado**: *"Jakob's Law morde de
verdade se o owner olha TradingView (verde/vermelho) e esta tela lado a lado no mesmo monitor. Aí não há
amortização — há alternância."* O owner confirmou a premissa. ⇒ a hipótese cai por realização do seu
próprio falsificador, não por preferência.

### E a correção China/Japão continua válida — ela agora aponta para o outro lado

O registro anterior estabeleceu, corretamente, que **não existe "a" convenção do setor: existem duas**
(ocidental verde-alta; China/Japão vermelho-alta) e que por isso **nenhuma tem direito de veto**.

Isso segue verdadeiro, e é **o que autoriza esta decisão**. Se nenhuma convenção tem veto *a priori*, o
critério de desempate não é "a convenção do setor" — é **qual convenção este usuário já tem
internalizada**. O produto é **single-user** (`SPEC-001` §8.3, auth mínima single-user) e o usuário
declarou usar TradingView diariamente na configuração ocidental. ⇒ para **N=1**, "duas convenções
incompatíveis" colapsa em **uma**. A correção não foi enfraquecida; foi **aplicada**.

---

## Decisão

**O eixo da governança de cor é o TIPO DE MARCA, não o significado.** Um papel não é dono de um *hue*;
é dono de um **(hue × tipo de marca × modo)**, e **o token só existe para as combinações permitidas**.

```
FILL  interior de forma geometrica (corpo/pavio de vela, area, barra, mini-barra).  piso 3:1   (SC 1.4.11)
INK   glifo de texto e traco de icone — qualquer coisa que se LE.                   piso 4.5:1 (SC 1.4.3)
ON    tinta desenhada EM CIMA de um fill (etiqueta de eixo, badge de crosshair).    piso 4.5:1 contra o fill
```

**A guarda deixa de ser uma regra que alguém tem de lembrar e passa a ser a AUSÊNCIA DO TOKEN.** Não se
pode tingir um numeral com a cor de direção porque `--direcao-alta-text` **não existe**.

### D-1 · Direção de preço segue a convenção ocidental, e vive SÓ em `fill`

`--direcao-alta-fill` **`#089981`** · `--direcao-baixa-fill` **`#f23645`** — os valores exatos da
TradingView, nos dois modos.

**E a medição fechou o caso por um segundo caminho independente:** o par da TradingView mede
**18,0** sob `min(protan, deutan, tritan)` e **PASSA** o piso de 15. O verde/vermelho *genérico*
(`#008300 ↔ #e34948`) mede **12,2** e é **WARN**. A TradingView escolheu um verde deslocado para o
**teal** (`#089981`, matiz ≈176°) e um vermelho claro e rosado (`#f23645`), e esse deslocamento é
exatamente o que separa o par sob dicromacia. ⇒ **não havia trade-off a pagar**: seguir a convenção que
o owner já lê **e** passar no critério de dicromacia são a mesma decisão.

### D-2 · Redundância de FORMA obrigatória na direção, e ela tem TRÊS estados

```
corpo VAZADO  =  close > open
corpo CHEIO   =  close < open
CRUZ (doji)   =  close == open  ⇒  DIREÇÃO NÃO AFIRMADA
```

**Motivo medido:** a razão de luminância entre os dois fills é **1,092** ⇒ em escala de cinza são a
**mesma cor**. E **nenhum par de hue resolve isso**: azul/laranja anterior **1,380**, verde/vermelho
genérico **1,251**. Os três colapsam sob o piso de 3,0. ⇒ o canal de forma é **obrigatório**, e isso
**não é um custo de ter escolhido verde/vermelho** — é um custo do *hue*.

O terceiro estado é a correção de um defeito que ninguém havia visto: **quando `open ≈ close` o corpo
tem ~1 px e não há interior para esvaziar.** Ver §3 (C7).

### D-3 · Integridade do dado é VIOLETA, e o hue é o TERCEIRO canal, nunca o primeiro

`--dado-quebrado-ink` **`#581c87`** (claro) · **`#e0aaff`** (escuro). Tipo de marca: **`ink` e só**.

A afirmação *"este número quebrou"* chega por três canais, nesta ordem:

1. **GLIFO** — um **losango vazado**, sempre o mesmo, **nunca triângulo nem círculo** (essas duas formas
   pertencem a severidade de dashboard e trariam vermelho de volta por hábito). A forma sozinha tem de
   bastar em escala de cinza.
2. **TEXTO** — a palavra: `QUARENTENA`, `idade ?`, `sem procedência`.
3. **HUE** — violeta no **traço do losango** e na **régua vertical do selo**. **Acompanha. Nunca porta.**

### D-4 · Ação e procedência NÃO consomem hue

Só existem **três hues** na interface: verde-teal, vermelho, violeta. Ação e procedência vivem no canal
de **luminância**. **Ação não é azul**, e o número que decide é `#1d4ed8 × #6d28d9` = **0,3** em deutan:
azul e violeta são a **mesma cor** para um deuteranope, e botão e selo quebrado dividem o cabeçalho de
painel — que é a definição de par crítico.

### D-5 · Severidade OPERACIONAL é papel distinto de integridade de dado, e não tem token de cor

`--severidade-*` **não existe**. *"Coletor PAROU"* (`S1`, fase `07`) é **severidade operacional**, não
integridade de dado, e **não herda o violeta**. Ela vive em **glifo + palavra + luminância**. Ver §3 (C4).

### D-6 · O veredito de dicromacia é `min(protan, deutan, TRITAN)`

Antes desta ADR o veredito era `min(protan, deutan)` e tritanopia estava `[NÃO MEDIDO]` — era o
**falsificador declarado** da escolha do violeta. **Ele se realizou.** Ver §3 (C1).

---

## Consequência

### Os 4 arquivos que passam a divergir da fonte, e o que cada um exige

| arquivo · linha | o que está lá | tratamento |
|---|---|---|
| `docs/specs/SPEC-001-plataforma-dados.md:542` (§6.2) | *"vermelho significa o dado quebrou"* + os 3 números que não reproduzem + *"trocar = 2 tokens"* | **superseded por esta ADR.** Edição de citação preparada em §5, **não aplicada** |
| `docs/specs/SPEC-001-plataforma-dados.md:643` (`Q13`) | *"token por papel ⇒ trocar = 2 tokens"* | idem |
| `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md:34` (`D5.6`) | a **saída esperada** nomeia `#2a78d6 ↔ #eb6834` e os números revogados | idem — e é o caso mais grave: é um **DoD**, logo é o que reprova |
| `docs/context/plataforma-dados/tasks_review.md:307` (`T-05.7`) | *"trocar custa 2 tokens"* + o par `#d03b3b ↔ #eb6834` | idem |

### O que muda no DoD `D5.6`

`D5.6` fixa **script E piso juntos** — era dívida declarada e esta ADR a fecha:

```
comando:   node scripts/validate_palette.js
estimador: Brettel, Vienot & Mollon (1997), dois semiplanos, planos DERIVADOS em execucao
distancia: CIEDE2000, D65, 2 graus
veredito:  min(protan, deutan, tritan) >= 15 para todo par CRITICO, nos dois modos
saida:     exit 0, 361 medicoes
```

⚠️ **O piso 15 continua SEM procedência normativa.** É adotado por este projeto e declarado no
cabeçalho do script, junto de `FRACAO_WARN = 0,45`, `PISO_CINZA = 3,0` e `PISO_CINZA_TINTA = 1,5`.
`PISO_TEXTO = 4,5` e `PISO_GRAFICO = 3,0` vêm da WCAG 2.2 e **são norma**. A distinção está no script
porque a rodada anterior calibrou um piso contra um estimador desconhecido e **o piso não transportou**.

### `Q13` continua não gateando, mas o motivo mudou

Não porque a troca é trivial — são **25 tokens, 4 com hue, 361 medições** — e sim porque ela é
**mecânica e verificável por comando**. Barato em edição, **caro em validação**, e é a validação que
decide.

---

## Alternativas rejeitadas, com o custo MEDIDO de cada

### A-1 · Inversão total (o que estava na SPEC): vermelho = dado quebrado, direção sem vermelho

**Custo medido, e ele é duplo:**

- **Jakob's Law:** `laws-of-ux-encyclopedia.md:170` — *"Reserve novelty for your unique value
  proposition, not for standard interaction patterns."* Direção de preço **não é** a proposta de valor
  única deste produto; integridade de dado **é**. A rodada anterior gastou a novidade no lugar errado.
  `nng-ux-heuristics/SKILL.md` §H4: inconsistência aumenta tempo de aprendizado em **25–50%**.
- **E a inversão não comprava o que alegava comprar.** Sob a paleta antiga, integridade era vermelho
  `#d03b3b` e a vela de baixa era laranja `#eb6834`. Medido: **11,3** em deutan ⇒ **FAIL**. E o vermelho
  que o gerador escolhia (`#f23645`) contra o mesmo laranja mede **5,3** em deutan — **o pior par já
  medido neste projeto**. ⇒ a inversão punha o canal de integridade **em colisão com o objeto mais
  numeroso da tela**. Von Restorff (`laws-of-ux-encyclopedia.md` §10): *"If everything is bold,
  colorful, and oversized, nothing is distinctive."* O canal de integridade não estava isolado.

**Custo total: pagava reaprendizado E não entregava separação.**

### A-2 · Meia-medida: direção azul/vermelho, integridade em outro hue

**Custo medido: paga o reaprendizado inteiro e compra ZERO.** `#f23645 × #2a78d6` mede **41,4** e passa
— mas **não é o par da TradingView**, logo o custo de Jakob é integral. E o par da TradingView já mede
**18,0**, que passa. ⇒ a robustez que esta alternativa compraria **já vinha de graça com a convenção**.

### A-3 · Integridade sem hue nenhum: só glifo + palavra

**Custo medido:** deixaria a interface com exatamente **dois** hues, **ambos no eixo L/M** — o eixo que
protanopia e deuteranopia **perdem** (é onde o par de direção mede 18,0 contra 61,4 em tritan). O único
papel cujo hue **sobrevive** a protan/deutan é o violeta, medido em **19,5** contra a tinta fraca.
Removê-lo é abrir mão do único canal cromático que funciona para ~8% dos leitores.

**⚠️ `[NÃO SEI]` quantificar o outro lado do custo:** de quanto seria a perda de afordância periférica
(ver "quebrou" com o olho na borda do campo visual, sem ler). Não tenho medição e **não vou estimar**.

### A-4 · Manter `#6d28d9`/`#c084fc` e aceitar a falha de tritanopia por prevalência

**Rejeitada, e o argumento de prevalência é o que está errado.** Ver §3 (C1).

---

## Falsificador

**Primeiro, e é o que derruba o desempate:** **se o produto deixar de ser single-user** — segundo
operador, ou o owner mudando o tema da TradingView para a convenção asiática — o critério de desempate
**perde a base** e D-1 volta à mesa. Isto é a **condição de validade** da decisão, não nota de rodapé.

**Segundo, e é o mais forte contra D-2:** se numa tela real um analista ler uma **vela vazada** como
*"anotada por mim"* (porque `HUMANO = halo` também usa "sem preenchimento"), o escopo por classe de
objeto não se sustenta e a redundância de direção tem de mudar de canal. **Mensurável hoje, sem usuário:**
a camada de overlay chega a posicionar um `swing_point` com halo a poucos px do contorno de uma vela
vazada, em zoom típico? É medição em `charts`, com `1.728` pontos sintéticos, zero rede.

**Terceiro:** se `forced-colors: active` produzir o **híbrido descasado** descrito em §3 (C8) num ambiente
real do owner, a premissa de degradação graciosa cai e a paleta tem de virar **argumento** de `charts`.

**Quarto:** se o piso 15 receber procedência normativa e a norma disser outro número, todos os vereditos
de dicromacia deste projeto se recalculam. O piso é o elo mais fraco da cadeia e está declarado como tal.

---

## §5 · Edições de citação PREPARADAS e NÃO APLICADAS

**Não apliquei nenhuma.** `docs/specs/` e `docs/plans/` são artefatos do owner e do arquiteto (R6/R8), e
a SPEC está `SPEC_APPROVED`. Cada item abaixo é **correção de citação sob esta ADR**, não mudança de
decisão.

**E-1 · `docs/specs/SPEC-001-plataforma-dados.md:540-542`** — substituir o título §6.2 e o corpo:

- título: `### 6.2 Vermelho não significa "preço caiu"` → `### 6.2 Governança de cor por tipo de marca`
- corpo: trocar por um ponteiro para esta ADR + os números que reproduzem:
  `#089981 ↔ #f23645` **PASS** min3 **18,0** · `#008300 ↔ #e34948` **WARN** **12,2** ·
  `#f23645 ↔ #eb6834` **FAIL** **5,3** · e *"trocar o esquema = **4 valores de hue + 361 medições**"*.

**E-2 · `docs/specs/SPEC-001-plataforma-dados.md:643`** — `Q13`, coluna final:
`token por papel ⇒ trocar = 2 tokens` → `RESPONDIDA pelo owner 2026-08-25 (convenção ocidental); ver ADR-010. Trocar = 4 valores de hue + 361 medições`.

**E-3 · `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md:34`** — `D5.6`, saída esperada:
`#2a78d6 ↔ #eb6834 PASS (protan ΔE 24,7/26,8) · #d03b3b ↔ #eb6834 FAIL em ΔE 10,8` →
`exit 0, 361 medições, min(protan,deutan,tritan) >= 15 em todo par crítico nos dois modos; #f23645 ↔ #eb6834 FAIL em 5,3 (deutan) é o par que prova que critical não cabe no canal de cor`.

**E-4 · `docs/context/plataforma-dados/tasks_review.md:307`** — `T-05.7`, DoD: mesma troca de números, e
*"trocar custa 2 tokens"* → *"4 valores de hue + 361 medições"*. **`tasks_review.md` está AGUARDANDO
APROVAÇÃO DO OWNER** (`docs/INDEX.md:38`) ⇒ é o candidato natural a absorver a correção antes de ser
aprovado, e não depois.

**E-5 · `docs/INDEX.md`** — entrada de ledger para esta ADR, quando ela for aceita.
