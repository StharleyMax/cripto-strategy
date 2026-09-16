# `T-04.6` — `design_gate` do painel novo de long/short (`DoD-5` da fase `04`)

**Data:** 2026-09-16 · **Cabeça julgada:** `db2302c` · **Branch:** `task/cinco-metricas-do-core-f04-front`
**Artefato de FORMA (proposta):** tela Stitch `687b69582b2d4af5baa6665fbadb35c8` —
`Estudo de Forma — Painel Long/Short (S2)`, gerada nesta sessão.
**Artefato de CÓDIGO (o que existe hoje):** `LongShortPane` em
`frontend/src/app/symbol/SymbolClient.tsx:1487-1548`, entregue por `T-04.5`.

**Validador:** `ux-ui-mastery` 3.0.0 — protocolos `/design-critique` (Liz Lerman + 10 dimensões) e
`/accessibility-check` (WCAG 2.2 AA), lidos de
`~/.claude/plugins/cache/ux-ui-mastery-marketplace/ux-ui-mastery/3.0.0/commands/`.
**Fonte de verdade de design:** `docs/product/STITCH_CONTEXT.md` §5 + §9 (colado **verbatim**, `R3`).

⛔ **Nenhuma ferramenta de Figma foi usada.** Elas estão presentes neste ambiente (o MCP do Figma
está montado e anuncia `generate_figma_design`, `use_figma`, `create_new_file`) e são **proibidas
pelo owner em qualquer hipótese**. Todo o design deste repositório é no Stitch.

⛔ **Nada foi commitado. `frontend/` não foi tocado** (outro agente escreve o e2e de `T-04.7` em
paralelo). **`gate-record` NÃO foi gravado** — é ato do owner. Postgres não foi tocado; a API de
produção foi lida **somente** por `GET`.

---

## VEREDITO: **NEEDS_FIX**

| | |
|---|---|
| **must-fix** | **4** — `M-1` (números que não reproduzem) · `M-2` (carry-forward desenhado) · `M-3` (procedência autocontraditória) · `M-4` (alpha reprovando 1.4.11) |
| **should-fix** | **5** (`S-5` … `S-9`) |
| **could-improve** | **2** (`m-10`, `m-11`) |
| **eixos aprovados sem ressalva** | **5** — paleta · `SC 1.4.1` por construção · a faixa carregada pela BORDA · completude com os dois números · o travessão do `SEM_PONTO` |

⇒ **`DoD-5` da fase `04` NÃO está satisfeito.** O item exige veredito `APPROVED` **registrado**, e o
veredito desta rodada é `NEEDS_FIX`. Este arquivo é o registro; a fase segue bloqueada neste item.

**O que reprova não é a linguagem visual — é o que a tela AFIRMA.** A paleta, a tipografia, a
densidade e os três canais de ausência estão certos e medidos. O que reprova são **quatro
afirmações falsas**: um rodapé que publica uma amplitude que a produção não devolve, um traço que
carrega valor adiante numa série que o servidor recusa carregar, um cabeçalho que diz `OBSERVADO`
ao lado de `SEM PROCEDÊNCIA` com zero observações, e um `opacity` que derruba abaixo do piso o
único delimitador da faixa que a tela existe para introduzir.

---

## 0. ⚠️ Duas correções de PREMISSA, antes de qualquer achado — e as duas são minhas

### 0.1 `R1` é INEXECUTÁVEL hoje: `GEMINI_3_1_PRO` não existe mais no schema do MCP

`R1` do agente e `STITCH_CONTEXT.md:48` mandam **`modelId: GEMINI_3_1_PRO` em toda geração**
`[PREMISSA-OWNER: 2026-08-25]`. **Tentei, e o servidor recusou:**

```
mcp__stitch__generate_screen_from_text(modelId="GEMINI_3_1_PRO", …)
  => "Request contains an invalid argument."
```

O enum publicado hoje pelo schema do tool tem **três** membros, e nenhum é o pedido:
`MODEL_ID_UNSPECIFIED` · `GEMINI_3_8_FLASH` · `GEMINI_3_5_FLASH_LITE`
`[MEDIDO 2026-09-16: `x-google-enum-descriptions` do parâmetro `modelId`, n=3]`.

**A chamada que produziu esta tela foi feita SEM `modelId`** (portanto no default do servidor, que
se identificou na resposta como `"agentType":"PRO_AGENT"`). **Registro em vez de silenciar** porque
uma regra determinística que o ambiente não aceita mais **deixou de ser cumprida sem nada avisar** —
a mesma classe de quebra silenciosa que `CLAUDE.md` nomeia para `core.hooksPath`.

⇒ **Pendência com dono: o owner.** Ou `R1` passa a nomear um modelo que existe, ou passa a dizer
"default do servidor". **Não decidi por ele** — é `[PREMISSA-OWNER]`, e reescrever premissa de owner
não é ato de agente.

### 0.2 `STITCH_CONTEXT.md` está com a contagem de telas DESATUALIZADA — de novo, e pelo mesmo motivo

A linha 4 diz **"Telas no Stitch hoje: 7"** `[MEDIDO: list_screens, 2026-09-02]`. **São 9 antes
desta sessão, 10 depois** `[MEDIDO 2026-09-16: `get_project.screenInstances`, 12 instâncias, das
quais 3 são `DESIGN_SYSTEM_INSTANCE`]`. As duas não documentadas são
`139ff404d0b243649f9dd18bcaf073ea` (y=4636) e `422dff0a624349b39e1083cd40917eb6` (y=5916),
`[INFERRED: pela posição no canvas e pela data, são da feature filha `pagina-de-grafico-s2`]`.

É **exatamente** o modo de falha que a TARJA de 2026-08-28 daquele arquivo já nomeou —
*"contagem é estado, e estado escrito em prosa envelhece em silêncio"*. **Não corrigi o arquivo:**
`R6` manda propor e aguardar. A proposta está no §8 deste laudo.

---

## 1. Contexto do julgamento — e a separação que o torna um gate, não uma autoavaliação

`CLAUDE.md` §"Design": *"agente que gera e aprova o próprio trabalho não tem gate"*. Aqui:

| o que | quem fez | julgado por este gate? |
|---|---|---|
| a ESTRUTURA do painel no código (`data-testid`, `RN-1`, `RN-S1`) | builder de `T-04.5` | **sim** — é o artefato que vai a produção |
| a FORMA proposta (tela Stitch `687b6958…`) | eu, nesta sessão | **sim, e é conflito declarado** — ver abaixo |

⚠️ **O conflito de interesse existe e não o escondo:** metade do que julgo aqui eu mesmo gerei.
A mitigação é **método, não boa-fé**: nenhum achado abaixo se apoia em juízo estético — cada um é
um `grep`, um contraste calculado, ou uma consulta à API de produção reproduzida no §7. **E o
achado `S-7` reprova uma decisão que foi minha**, medida contra o próprio objetivo que ela existia
para servir — é a evidência de que o método mordeu o gerador.

**O que o gate NÃO pode substituir:** um segundo par de olhos humano. `[NÃO SEI]` se um validador
independente acharia os mesmos 4 must-fix, e o owner declarou não ter repertório para arbitrar.

---

## 2. Statements of Meaning — o que está certo e tem de ser PROTEGIDO na iteração

### 2.1 A paleta não tem um único desvio, e isso é `13/13` mantido

```bash
grep -oE '#[0-9a-fA-F]{6}' /tmp/ls-study.html | sort | uniq -c | sort -rn
#   77 #8b949e · 51 #222634 · 50 #e6e9ef · 15 #0d1017 · 10 #e0aaff · 7 #131722
grep -ocE '#2a78d6|#eb6834|#a8c8ff|#4b91f1|#121315|#16181d|#0d0e10|#2a2e39|#6d28d9|#c084fc|#ffb4ab' \
  /tmp/ls-study.html   # => 0
```

**Seis hexes na tela inteira, e os seis são canônicos.** Zero revogado, zero superfície inventada.
As três superfícies são exatamente `#131722` / `#0d1017` / `#222634`. E os 13 desvios do item 16 do
§9 foram verificados um a um:

```bash
for p in backdrop-blur overflow-y-auto shadow- gradient bg-opacity rounded \
         'LIVE' 'AS AT T' Documentation 'API Status' 'lang="en"' notification bell 'PROD '; do
  printf '%-18s %s\n' "$p" "$(grep -oc "$p" /tmp/ls-study.html)"; done
# todos 0
```

⇒ **`0/14`.** `lang="pt-BR"`, `<title>` em português, acentuação correta, zero sino, zero login.
**A lacuna que a 6ª revisão do `STITCH_CONTEXT` previu que reincidiria — `lang="en"` em tela nova —
NÃO reincidiu**, porque a instrução pediu explicitamente. Continua verdadeiro que o §9 não a
prescreve; continua sendo dívida daquele arquivo, não desta tela.

### 2.2 `SC 1.4.1` satisfeito POR CONSTRUÇÃO, não por verificação

**Não há verde nem vermelho em lugar nenhum da tela** — e a decisão está certa pelo motivo que
`gates/design-05.md` §6.1 já fixou para as coortes de liquidação: `long`/`short` aqui são **coortes
de contas**, não direção de vela. Pintá-las com o par de direção convidaria a ler coorte como
direção do mercado, que é o item 1 do §5 do `STITCH_CONTEXT`. O único hue da tela é o violeta de
integridade, e ele é o **terceiro** canal — losango vazado + palavra `QUARENTENA` + cor:

```
E5 integridade: glifo 2 · palavra 3 · violeta(por papel) 10     (verify_screen.py)
```

Sob ablação de cinza o violeta cai para `L=0.5182` contra `L=0.8133` da tinta forte (razão
**1.52**) — **a cor sozinha não bastaria, e é por isso que ela não está sozinha.** A forma
(losango) e a palavra sobrevivem à ablação inteiras.

### 2.3 ⭐ A faixa das 4h é carregada pela BORDA, não pelo fill — e o número prova

Esta é a melhor decisão da tela, e ela reproduz o argumento do §9 item 6 sobre o botão
(*"a BORDA é que carrega a fronteira, porque o fill sozinho dá 1.32:1"*):

| marca | contraste contra o plot `#131722` | veredito |
|---|---:|---|
| **fill** da faixa (`#222634`) | **1.19** | reprovaria `1.4.11` sozinho |
| **borda** da faixa (`#8b949e`, 1px) | **5.82** | passa com folga de `2.82` sobre o piso 3:1 |

⇒ um leitor futuro que olhe só o fill vai concluir que a faixa reprova. **Ela não reprova, porque
a informação não está no fill.** Registro o `1.19` aqui justamente para que a conclusão errada não
seja redescoberta.

### 2.4 A completude publica os DOIS números, e diz qual não é a manchete

`850 observações nativas de 5m` em tinta forte, `(2999/5760 grades de 1m)` em tinta fraca. É o
achado ⭐ de `T-04.5` — o divisor `÷5` de `RN-S1` subconta 28,6% — **transformado em hierarquia
visual**: o número que vale é forte, a escada é fraca e parentética. Quem publicasse só a escada
superestimaria a série em ~3,5×.

### 2.5 O travessão do `SEM_PONTO` aparece em TRÊS lugares coerentes

No Estado 2 o travessão aparece na leitura atual, na etiqueta do eixo (`— / fecho ausente`) e no
fecho do plot. **Nenhum `0`, nenhum `1.5202` velho, nenhum `--`.** Zero é um ratio legítimo nesta
série ("ninguém comprado"), então a fabricação seria invisível — e não foi feita.

---

## 3. Must-Fix

### 3.1 `M-1` — **BLOQUEANTE.** O rodapé publica uma amplitude que a produção não devolve

`ls-study.html:176-177`, Estado 1:

> *"Janela total 4d: **1.1200 a 1.5450** (amplitude: **0.4250** · variação **+37.9%**)"*
> *"Últimas 4h: 1.4981 a 1.5240 (amplitude: 0.0259 · variação **6.1% da escala do painel**)"*

**Medido contra a produção viva, os quatro números estão errados:**

| publicado | medido | erro |
|---|---|---|
| mínimo `1.1200` | `1.1395` | — |
| máximo `1.5450` | **`1.8369`** | subconta **0.2919** |
| amplitude `0.4250` | **`0.6974`** | subconta **39,1%** |
| variação `+37.9%` | **`42.08%`** | — |
| `6.1% da escala` | **`3.71%`** | **superestima 1,64×** (usa o denominador inventado) |

E há **contradição interna na mesma tela**: o eixo do próprio painel imprime `1.7000` no topo,
**acima do máximo que o rodapé declara** (`1.5450`). Os dois não podem estar certos.

**Por que isto é bloqueante e não cosmético:** o rodapé (c) é a peça que a tela inteira existe para
introduzir — ele é a resposta ao problema da reta, e a sua função é fazer a compressão ser **lida
em vez de adivinhada**. Um leitor que confie nele lê `6.1%` onde o real é `3.71%` e conclui que a
série se move **1,64× mais** do que se move, no exato prazo em que ele decide. **Um instrumento de
compressão que erra a compressão é pior que nenhum**, e é o `CLAUDE.md` §"Nenhum número sem o
comando que o produziu" aplicado à tela em vez do documento.

**Remédio:** os números do painel são **derivados**, não redigidos — têm de sair do mesmo
`view-model.ts` que já calcula `nativeBars`/`wirePoints`, com o mesmo teste de contrato que impede
o builder de digitá-los. Nenhum numeral do rodapé pode ser literal no JSX.

### 3.2 `M-2` — **BLOQUEANTE.** O Estado 2 desenha CARRY-FORWARD, que esta série proíbe

`ls-study.html:245`:

```html
<line x1="1060" y1="74" x2="1180" y2="74" stroke="#8b949e" stroke-width="1" stroke-dasharray="2 4" />
```

É uma **linha horizontal no último valor medido**, atravessando os 120px finais — exatamente a
região que o painel acabou de declarar `SEM_PONTO`. O tracejado atenua, **não desfaz**: a marca
continua afirmando *"o valor permaneceu aqui"* sobre um intervalo em que nada foi observado.

**A série recusa isso no servidor, e o próprio painel escreve o motivo** —
`SymbolClient.tsx:1479-1485`:

> *"This series is `Nature.RATIO` with `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` — **nothing
> is ever held forward**, so the readout at the window's last instant is EXACT or it is `SEM_PONTO`"*

⇒ **a forma proposta reintroduz, em pixels, o estado que a arquitetura eliminou em código.** É o
tratamento de `STOCK` (§9: *"série de estoque mostra o último valor em tinta fraca … com uma
linha-guia apontando PARA TRÁS"*) aplicado a uma série que não é estoque. A linha-guia do `D5.2`
aponta **para trás, até a medida verdadeira**; esta aponta **para a frente, até um instante sem
medida**. São afirmações opostas com a mesma geometria.

**Remédio:** a linha termina no último ponto observado. O fecho ausente já é dito por três canais
corretos (travessão na leitura, `—` no eixo, palavra no rodapé). O quarto canal é o que mente.

### 3.3 `M-3` — **BLOQUEANTE.** `OBSERVADO` e `SEM PROCEDÊNCIA` no mesmo cabeçalho, com 0 observações

Estado 3, `ls-study.html:300` e `:312`, separados por ~40px na mesma linha:

```html
<span class="text-[#e6e9ef] font-semibold">OBSERVADO</span>
...
<span class="text-[#e0aaff] font-bold">QUARENTENA · SEM PROCEDÊNCIA</span>
```

Com `0 observações nativas (0/5760 grades)`. **As duas afirmações são opostas, e uma delas é
falsa por construção:** não há observação da qual `OBSERVADO` possa ser predicado.

**Por que é a classe de defeito mais grave desta tela:** o produto inteiro existe para *"impedir
que um número sem procedência chegue a uma decisão"*. Uma tela que carimba `OBSERVADO` sobre o
vazio não falha em exibir procedência — ela **falsifica** procedência, e no estado em que o
operador mais precisa confiar no carimbo.

**Remédio:** procedência é propriedade da observação, não do painel. Sem observação, o campo
`procedência` sai da tela (como a `idade` sai), e a afirmação migra inteira para o canal de
integridade. `panel-status.ts:133-141` já tem o tipo certo para isso — `SeriesProvenance` com
`unresolved` que **não colapsa** em `origin` (`gates/design-05.md` §6.2). A forma tem de usar o tipo
que o código já expressa em vez de escrever uma quarta variante em HTML.

### 3.4 `M-4` — **BLOQUEANTE.** `opacity="0.5"` derruba o delimitador da faixa abaixo de `1.4.11`

`ls-study.html:125` (e `:237`):

```html
<line x1="1030" y1="0" x2="1030" y2="200" stroke="#8b949e" stroke-dasharray="2 2" opacity="0.5" />
```

É a **fronteira esquerda da janela de operação** — a marca que diz onde começam as últimas 4h.
Composta sobre `#131722`, `#8b949e @ 50%` resolve para **`#4f5660`**:

```
contraste(#4f5660, #131722) = 2.41     piso WCAG 2.2 SC 1.4.11 (objeto gráfico) = 3.0   ⇒ FAIL
```

E `§9` item (i) é literal: **"Sem blur, sem alpha."** O alpha aqui não é decorativo — ele está no
único elemento que delimita a faixa que esta tela existe para introduzir.

**Remédio:** `#8b949e` sólido (**5.82**, folga de 2.82) e, se a marca competir com a linha de dado,
separe por **dash pattern**, não por opacidade. Luminância é o canal de ênfase disponível
(`ADR-010` §5.4); alpha é um jeito de gastá-lo abaixo do piso.

---

## 4. Should-Fix

### 4.1 `S-5` — `QUARENTENA` está sendo usada fora do vocabulário fechado

`STITCH_CONTEXT.md` §2 define quarentena com precisão: *"série com `label_shift`, `unit` ou
`available_at` nulos"*. O Estado 3 é **`unit: ratio` presente, série resolvida, zero observações na
janela** — isso é **ausência**, não quarentena. Reusar a palavra achata duas afirmações distintas
(*"a série está malformada"* vs *"a série está bem formada e não produziu nada"*) num único termo,
e a primeira exige ação no coletor enquanto a segunda pode ser normal. **`verify_screen.py` exige a
palavra `QUARENTENA` para não reprovar `E5`** — então o incentivo do instrumento empurra para o
termo errado. Registrado como defeito do instrumento também.

### 4.2 `S-6` — `idade: [não aferível]` é o campo que o §9 manda NÃO exibir

`ls-study.html:316`. O §9 item 10 é literal:

> *"Quando o atraso do endpoint não foi medido, a idade **NÃO é exibida**: a afirmação 'não sabemos
> a idade' pertence ao canal de INTEGRIDADE (losango mais palavra), não ao campo idade."*

O placeholder faz as duas coisas que a regra separa: mantém o campo **e** põe a afirmação nele.
**Remédio:** o par `idade:` + `[não aferível]` sai; o losango já está a 40px dali.

### 4.3 `S-7` — ⚠️ **A régua de 1.0000 PIORA a planura, e a decisão foi MINHA**

Pedi a régua em `1.0000` (equilíbrio comprados/vendidos) como parte da resposta ao problema da
reta. **Medida, ela anda contra o próprio objetivo:** ancorar a escala no equilíbrio alarga o
domínio vertical de `0.6974` para `0.8369` e **rouba 17% da resolução**:

| escala | amplitude | 15min: excursão mediana | 15min: janelas sub-pixel | 4h: excursão mediana |
|---|---:|---:|---:|---:|
| autoescala pura (`1.1395..1.8369`) | `0.6974` | `0.88 px` | **26.7%** | `13.18 px` |
| **ancorada em 1.0000** (`1.0000..1.8369`) | `0.8369` | **`0.74 px`** | **`35.1%`** | **`10.99 px`** |

⇒ **a régua transforma mais 8,4 pontos percentuais das janelas de 15 min em movimento
sub-pixel.** O elemento introduzido para combater a ilegibilidade a produz.

**E ela não é inútil** — `1.0000` é o único valor com significado absoluto nesta série, e sem ele
o operador não sabe de que lado do equilíbrio está. **O conflito é real, e a saída não é escolher
por gosto:** a régua vira um **rótulo de borda** (uma seta e o texto `1.0000 abaixo` na margem
inferior do eixo) em vez de uma linha **dentro** do domínio. O operador ganha o lado sem pagar os
17%. `[NÃO MEDIDO]` se o rótulo de borda basta cognitivamente — é a pergunta do §6 `Explore`.

### 4.4 `S-8` — 22 nós de texto abaixo do piso tipográfico do próprio §9

```bash
grep -oE 'text-\[[0-9]+px\]|font-size="[0-9]+"' /tmp/ls-study.html | sort | uniq -c | sort -rn
#  11 text-[9px] · 11 text-[10px] · 10 text-[11px] · 5 font-size="9" · 3 font-size="10" · …
```

§9 item 14: *"texto secundário 12-13px"*. **`16` nós a 9px e `14` a 10px** — abaixo do piso que o
próprio contexto prescreve, e o `9px` alcança rótulos que carregam número (`últimas 4h [1.4981 a
1.5240 · amp 0.0259]`, `PARIDADE`, `Mais Contas Long`). **Não é contraste** — `#8b949e` sobre
`#131722` mede `5.82` e passa AA. É **tamanho**, e a `SC 1.4.4` (resize 200%) tem folga menor
partindo de 9px. Densidade analítica é a meta certa; 9px é densidade além do que o §9 autorizou.

### 4.5 `S-9` — zero heading, zero landmark, zero `aria-label` no artefato Stitch

```bash
grep -cE '<h[1-6]|aria-label=|role=' /tmp/ls-study.html   # => 0
```

O `/accessibility-check` reprova em três critérios: **1.3.1** (info e relações — três painéis
distintos sem nome acessível nem cabeçalho), **2.4.6** (headings e labels) e **2.4.1** (nenhuma
região navegável). Os três `<section>` são indistinguíveis para leitor de tela.

⚠️ **E aqui a nota que impede a conclusão errada: o CÓDIGO ACERTA onde o Stitch erra.**
`SymbolClient.tsx:1519-1520` tem `<section aria-label="Long/short">` e `:1530` tem `<h2>`; a rota
tem `<h1 class="sr-only">`. ⇒ **`S-9` é limitação do artefato de estudo, não regressão do
produto** — mas vai listado porque, se a forma for transcrita para o `.tsx` a partir deste HTML,
a semântica **se perde no caminho**, e é assim que ela costuma se perder.

---

## 5. Could-Improve

- **`m-10`** — o chrome tem `MAINNET`, `UTC-3`, `v2.4.0`, `bundle 7f3a9c1`, mas **não tem
  `AO VIVO`/`COMO EM T`** (`grep -c 'AO VIVO\|COMO EM T'` → **0**). O §9 fixa o modo como
  primeira classe no chrome global. Numa tela de estudo de um painel isolado é defensável; se a
  forma migrar para a `S2`, a omissão vira defeito.
- **`m-11`** — a régua `1.0000` e a fronteira da faixa 4h usam **a mesma tinta** (`#8b949e`) e a
  mesma família de tracejado (`4 4` e `2 2`). São afirmações de naturezas diferentes (valor de
  referência vs recorte temporal) e devem se separar por padrão de traço, já que hue não está
  disponível.

---

## 6. `/design-critique` — as 10 dimensões

| dimensão | nota | observação |
|---|---:|---|
| Clarity | 6 | os três estados são inconfundíveis; o rodapé (c) é a peça certa — e publica número errado (`M-1`) |
| Consistency | 8 | 6 hexes canônicos, `0/14` nos desvios do item 16; perde pelo alpha (`M-4`), que o §9 proíbe literalmente |
| Hierarchy | 8 | tinta forte para a manchete, fraca para a escada — o achado de `RN-S1` virou hierarquia |
| Efficiency | 8 | tudo visível sem hover, nenhum clique para chegar ao fato |
| Accessibility | 4 | contrastes de texto passam AA (`5.82`–`15.65`); reprovam `1.4.11` (`2.41`) e `1.3.1`/`2.4.6` (`S-9`) |
| Emotional Design | 8 | sóbrio, sem um único ruído afetivo: zero emoji, zero triângulo amarelo, zero sino |
| Error Resilience | 3 | **o pior eixo.** `M-2` desenha carry-forward e `M-3` carimba `OBSERVADO` sobre o vazio — os dois estados que o painel existe para não mentir |
| Cognitive Load | 6 | o cabeçalho de painel empilha 7 campos numa linha de 30px a 11px |
| Innovation | 8 | responder à compressão com **faixa + rodapé numérico** em vez de zoom ou segunda série é a direção certa, e é reversível |
| Polish | 5 | a régua reprova a si mesma (`S-7`); 9px abaixo do piso; números que não reproduzem |

**Média: 6,4/10.**

---

## 7. ⛔ O FALSIFICADOR DA RETA (`T-04.9`) — a pergunta que a fase manda responder

> *"se o painel de `count_long_short_ratio` for uma linha **VISUALMENTE PLANA** no timeframe de
> operação (`15min..4h`), a fatia ACRESCENTA `sum_taker_long_short_vol_ratio` como SEGUNDA série
> do MESMO painel"* — `tasks.toml:T-04.9`

### 7.1 Veredito: **DISPARA PARCIALMENTE — e NÃO pelo motivo que a fase supôs**

**Medido contra a produção viva, 4 dias, `n=850` observações nativas** (comando no §7.4):

| janela de operação | obs. nativas (mediana) | excursão vertical mediana | janelas **sub-pixel** (< 0,5px) |
|---|---:|---:|---:|
| **15 min** | **3** | **`0.88 px`** | **`26.7%`** |
| 1 h | 12 | `4.45 px` | `2.8%` |
| 4 h | 48 | `13.18 px` | **`0.0%`** |

**Painel de `220px` (`CHART_HEIGHT_PX`, `SymbolClient.tsx:342`), área de plot `154px` com as margens
default da biblioteca ⇒ `1px = 0.00453 ratio`.**

⇒ **No piso da banda operacional (15 min) o painel É visualmente plano**: mediana **abaixo de 1
pixel**, e **mais de um quarto** das janelas de 15 min não movem meio pixel — abaixo do que um
monitor pode representar. **No teto (4h) NÃO é plano**: `13.18 px` de mediana e **nenhuma** janela
sub-pixel. Autocorrelação lag-1 confirmada em **`0.9989`**, e a amplitude de 4 dias é **`42.08%`**.

### 7.2 ⭐ Mas a causa é a JANELA, não a série — e isso muda o remédio

A planura acima é medida **com a escala autoescalada sobre os 4 dias**, que é o que a rota
entrega. Medindo a estrutura da série de forma **independente da escala**, ela não é plana:

| janela | valores DISTINTOS (mediana) | excursão em QUANTA (`0.0004`) | janelas literalmente constantes |
|---|---:|---:|---:|
| 15 min | **3.0** | **10.0** | **4.6%** |
| 1 h | 10.0 | 50.4 | 1.4% |
| 4 h | 34.0 | 149.3 | 0.0% |

⇒ **em 15 min a série tem, na mediana, 3 valores distintos e 10 quanta de movimento.** Ela **tem**
estrutura nesse prazo; o que a apaga é dividir `154px` por uma amplitude de 4 dias **6× maior** que
a do prazo de decisão. **Isto é defeito de VIEWPORT, e ele já tem nome e dono neste repositório:**
é o `M-2` de `gates/design-05.md` — *"a janela declarada não é a janela desenhada"* — escalado como
**transversal aos 4 painéis** e derivado de `request-window.ts::resolveRouteWindow`.

### 7.3 ⇒ A recomendação, e ela CONTRARIA a ação que o falsificador pré-escreveu

**Acrescentar `sum_taker_long_short_vol_ratio` NÃO resolveria o que foi medido**, por três razões
independentes:

1. **A segunda série entraria na MESMA escala comprimida.** O remédio não toca o denominador que
   produz a planura. Uma série de autocorrelação `0.0955` num eixo de 4 dias vira **ruído denso**,
   não legibilidade — troca-se "não se move" por "não se lê".
2. **⛔ A série NÃO EXISTE no catálogo servido hoje.**
   `GET /api/v1/series-catalog` → `n_entries=60`, **7 métricas distintas**, e
   `sum_taker_long_short_vol_ratio` **não é uma delas** `[MEDIDO 2026-09-16, §7.4]`. O remédio que a
   fase pré-autorizou **não tem dado**: exige entrada de catálogo nova **e** coleta, que é trabalho
   de `sentimento`/`infra`, não a "outra chamada" que `T-04.9` supõe ser reversível dentro da fase.
3. **A resposta certa já está desenhada, e é a desta tela.** A faixa das 4h + o rodapé numérico
   dizem **quanto a série andou no prazo de decisão sem exigir zoom** — atacam a compressão onde
   ela nasce. Essa é a razão de `M-1` ser bloqueante: **o remédio está certo e o número dele está
   errado**, e um remédio certo com número errado é o pior dos dois mundos.

⚠️ **O que eu NÃO afirmo:** que a segunda série seja inútil. `[NÃO SEI]` — `sum_taker_long_short_vol_ratio`
mede fluxo de *taker*, não posicionamento de contas; pode ter valor **próprio**, independente desta
pergunta. O que afirmo é que **adicioná-la não resolve a planura medida**, e que a decisão de
coletá-la é `[DECISÃO-OWNER]` por custo de cota, não consequência automática deste laudo.

**⇒ Proposta a `T-04.9`:** trocar o gatilho do falsificador de *"a série é plana ⇒ acrescente uma
segunda série"* para *"a série é plana **na escala entregue** ⇒ conserte a escala"*, e reapontar o
item para o `M-2` transversal de `gates/design-05.md`. **Não executei a troca** — `tasks.toml` é
plano de fase, e alterá-lo é ato de quem é dono dela.

### 7.4 Reprodução — os comandos, literais

```bash
# 1. a série, da produção viva (somente leitura)
NOW=$(( $(date +%s) * 1000 )); START=$(( NOW - 4*24*60*60*1000 ))
curl -s "http://localhost:8000/api/v1/series-history?series_key_id=279d3172f5f2572d71c72f23cb7249edff91b405c2b1e7bc88c3b664963d8e3e\
&symbol=BTCUSDT&interval=1m&bar_policy=final_only&window_start_ms=$START&window_end_ms=$NOW&knowledge_time_ms=$NOW" \
  -o /tmp/ls4d.json                     # 200, 502203 bytes, rows=5760

# 2. nativas = available_at DISTINTOS (a contagem de T-04.5 §4; a escada tem 1..5 slots por corrida)
#    => 5760 slots · 2999 com valor · 850 nativas · min 1.1395 max 1.8369 · autocorr lag1 0.9989

# 3. excursao por janela, em PIXEL: PLOT = 220*(1-0.2-0.1) = 154px ; px_por_unidade = 154/0.6974
#    => 15min 0.88px/26.7% sub-pixel · 1h 4.45px/2.8% · 4h 13.18px/0.0%

# 4. o catalogo NAO tem a segunda serie
curl -s http://localhost:8000/api/v1/series-catalog | python3 -c \
 "import json,sys; d=json.load(sys.stdin); print(sorted(set(e['key']['metric'] for e in d['entries'])))"
# ['count_long_short_ratio','cvd_source','klines_last','klines_volume',
#  'price_mark_close','sum_liquidation','sum_open_interest']
```

---

## 8. `verify_screen.py` contra esta tela — 9 reprovações, e **8 são falso negativo estrutural**

```bash
python3 scripts/verify_screen.py /tmp/ls-study.html   # REPROVADO (9 reprovacoes), exit 1
```

Segue o precedente que `STITCH_CONTEXT.md` §4.2.2 fixou para a `S1`: **o script é calibrado para a
`S2` inteira, com candles e painel de preço.**

| reprovação | classe | por quê |
|---|---|---|
| `P-preservacao` × 3 (`klines_last`, `structure_detection`, `taker_buy`) + `P5-preco` | **falso negativo** | procuram features do painel de **preço**. Esta tela não tem painel de preço, por escopo |
| `E2-particao` × 2 (`CHEIO 0`, `VAZADO 0`) + `E3a-terceiro-ramo` | **falso negativo** | procuram **candles**. Um `ratio` não tem OHLC — a série é `Line` por natureza, não por estilo |
| `E4-ablacao: colapsou de 0 para 0` | **falso negativo, e é um defeito do INSTRUMENTO** | `0 → 0` é o `rc=0` ambíguo que `ADR-012` nomeia: indistinguível entre *"nada colapsou"* e *"não havia o que medir"*. Aqui é o segundo — não há fill de direção na tela, por decisão correta (§2.2) |
| `E6-idade: 6 carimbos` | **falso negativo, por bug de contagem** | ver abaixo |

### 8.1 ⚠️ Dois defeitos do instrumento, achados de passagem e **não corrigidos**

**(a) `E6` conta carimbos de idade dentro de COMENTÁRIO HTML.** O regex `\bidade\b`
(`verify_screen.py:177`) roda sobre o arquivo inteiro:

```
total \bidade\b  : 6
sem comentarios  : 3      # <- o que o navegador renderiza
```

Os **3 renderizados** são exatamente um por painel, na borda direita do tempo — que é o que o §9
item 10 **manda**. ⇒ a reprovação de `E6` é do comentário, não da tela. *(Descartei a hipótese mais
óbvia: `\bidade\b` **não** casa dentro de `unidade` — medido, `False`.)*

**(b) `E5` exige a palavra `QUARENTENA`** (`:162`) para não reprovar. Isso **empurra o gerador para
o termo errado** quando o estado é ausência e não quarentena — é o incentivo que produziu `S-5`.

⛔ **Não corrigi nenhum dos dois:** `scripts/` está fora do escopo desta task e desta rodada, e a
instrução proíbe commitar. Registrados aqui para quem for dono do script.

---

## 9. O que `T-04.6` precisa para este gate virar `APPROVED`

Em ordem de precedência. **Só os quatro primeiros bloqueiam.**

1. **`M-1`** — todo numeral do rodapé e da faixa derivado do view-model, com teste de contrato que
   reprove literal no JSX. A amplitude real é `0.6974` (`1.1395..1.8369`), e a das últimas 4h vale
   **`3.71%`** dela, não `6.1%`.
2. **`M-2`** — a linha termina no último ponto observado. Nenhum traço atravessa a cauda ausente.
3. **`M-3`** — sem observação, o campo `procedência` sai da tela; a afirmação vive só no canal de
   integridade, pelo tipo que `panel-status.ts` já expressa.
4. **`M-4`** — `opacity` fora; `#8b949e` sólido, separação por dash pattern.
5. `S-5` … `S-9` — recomendações. `S-9` **não** é regressão do produto (o `.tsx` já acerta), mas é
   o item que se perde se a forma for transcrita deste HTML.

### 9.1 Proposta a `docs/product/STITCH_CONTEXT.md` — **redigida, NÃO aplicada** (`R6`)

| § | mudança proposta |
|---|---|
| linha 4 | contagem `7` → **`10`**, e — seguindo a própria TARJA de 2026-08-28 — **acrescentar os `screenId`**, porque *"um id não envelhece; uma contagem sim"* |
| §4.1 | subseção nova para o painel de long/short, **depois** de os 4 must-fix fecharem. Registrar `687b6958…` como **estudo de forma**, não como tela canônica: ela não é uma `S2` e `verify_screen.py` não a arbitra |
| §5 / linha 48 | `[NÃO SEI]` o que fazer com `GEMINI_3_1_PRO` — o modelo saiu do enum do MCP (§0.1). **É `[PREMISSA-OWNER]`; só o owner a reescreve** |

⛔ **Nenhuma linha de `docs/product/` foi alterada nesta sessão.**

---

## 10. Registro de execução

| item | estado |
|---|---|
| tela Stitch gerada | `687b69582b2d4af5baa6665fbadb35c8` · `2560×2048` · `DESKTOP` · DS `assets/0334450534074a98ba400e46f5b69dc7` |
| prompt | §9 do `STITCH_CONTEXT.md` **verbatim** (`R3`, 272 linhas / 19.455 B, `startswith` conferido) + instrução (25.177 B no total) |
| `modelId` | **default do servidor** — `GEMINI_3_1_PRO` recusado (§0.1). Resposta: `"agentType":"PRO_AGENT"` |
| `edit_screens` sobre a `S2` canônica | **NÃO executado** — `R7` (`S2` é BLOCKER) e `R5`. Tela nova, não edição |
| descoberta shadcn | `get_project_registries` → **nenhum registry configurado**; `frontend/components.json` **não existe**. ⇒ shadcn não é aplicável a este painel, que é `<canvas>` de `lightweight-charts` + texto |
| Figma | **nenhuma chamada**, em nenhum momento |
| `frontend/` | **intocado** — `git status` limpo na entrada; nada escrito lá |
| commits | **nenhum** |
| `gate-record` | **NÃO gravado** — ato do owner |
| Postgres | **não tocado**; API de produção lida só por `GET` |
