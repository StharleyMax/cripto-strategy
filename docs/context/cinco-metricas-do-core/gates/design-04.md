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

---
---

# RODADA 2 — `2026-09-16` · **a rodada 1 acima permanece intacta**

**Cabeça julgada:** `b0dfdb0` · **Branch:** `task/cinco-metricas-do-core-f04-front`
**Artefato de FORMA julgado:** tela Stitch **`7d87cac18168441cb538a78746709282`** —
`Estudo de Forma — Painel Long/Short (S2) Rev. 3`, `2560×2048`, `DESKTOP`,
DS `assets/0334450534074a98ba400e46f5b69dc7`. HTML baixado em `/tmp/ls-study-r2f.html` (22 769 B).
**Artefato de CÓDIGO:** inalterado — `LongShortPane`, `SymbolClient.tsx:1505-1548`. **`frontend/` não
foi tocado nesta rodada** (nem `scripts/`, nem `docs/plans/`, nem `tasks.toml`).

⛔ **Nenhuma ferramenta de Figma foi usada, em nenhum momento.** ⛔ **Nada foi commitado.**
⛔ **`gate-record` NÃO foi gravado** — é ato do owner. Postgres não foi tocado; a API de produção foi
lida só por `GET`.

## VEREDITO DA RODADA 2: **APPROVED**

| | |
|---|---|
| **must-fix** | **0** — `M-1`, `M-2`, `M-3` e `M-4` fechados, cada um com a medição abaixo |
| **should-fix** | **4** (`A-1` … `A-4`), sendo **`A-4` um achado NOVO que a rodada 1 deixou passar** |
| **could-improve** | **2** (`c-5`, `c-6`) |
| **`S-7`** | **resolvido**, e o ganho foi medido: sub-pixel de 15 min cai de **33,7% → 25,5%** |
| **`S-5`, `S-6`, `S-8`, `S-9`** | **resolvidos** (medidos no §R2.3) |

⇒ **`DoD-5` da fase `04` está satisfeito** no que compete a este item: o veredito é `APPROVED` e
**este arquivo é o registro**.

**A linha que separa a rodada 1 da rodada 2, e é ela que justifica o `APPROVED`:** a rodada 1
reprovou porque a tela **AFIRMAVA COISAS FALSAS** — um rodapé que publicava amplitude inexistente,
um traço que carregava valor adiante numa série que o servidor recusa carregar, um carimbo
`OBSERVADO` sobre zero observações. **A rodada 2 tem ZERO afirmação falsa.** O que resta são
**omissões com conserto de uma linha cada** — um `aria-hidden` que falta, uma regra de `:focus` que
não foi escrita, um canvas de tamanho fixo e um `user-select: none`. Omissão nomeada não é o mesmo
defeito que afirmação falsa, e misturar as duas classes foi o que a rodada 1 existiu para evitar.

---

## R2.1 ⚠️ A auditoria mordeu o gerador DE NOVO — 6 numerais fabricados na Rev. 2

**Isto é o registro mais importante desta rodada, e ele é desfavorável ao meu próprio processo.**

A primeira saída (`0738eb77a1924bcdad22e02f88fbd349`, Rev. 2) declarou, no próprio texto de resposta
do Stitch, ter cumprido os 4 bloqueantes. **Eu extraí TODO numeral renderizado e conferi um a um
contra a produção — e SEIS não vinham de medição nenhuma:**

| onde | Rev. 2 publicava | medido | como se mede |
|---|---|---|---|
| E1, idade | `1m14s` | **`1m16s`** | `knowledge_time 1789592608000 − available_at 1789592531242 = 76758 ms` |
| E2, completude | `842 nativas` | **`849`** | `available_at` distintos na janela que fecha em `1789592460000` |
| E2, completude | `(2960/5760)` | **`(2997/5758)`** | slots com valor / slots da janela truncada |
| E2, idade | `28m42s` | **`4m55s`** | `fecho − available_at da última observação = 295847 ms` |
| E2, teto de 4 h | `1.8098` | **`1.8114`** | a janela de E2 fecha 2 min antes ⇒ a janela de 4 h dela **começa antes** e alcança um máximo mais alto |
| E2, amplitude de 4 h | `0.3148 · 45,1%` | **`0.3164 · 45,4%`** | idem |

Consertados por `edit_screens` (§R2.7), produzindo a Rev. 3, que é a tela julgada.

⭐ **E o conserto deixou uma prova que uma fabricação não deixaria:** os Estados 1 e 2 agora
publicam **pares de 4 h DIFERENTES** (`1.8098 / 0.3148 / 45,1%` contra `1.8114 / 0.3164 / 45,4%`),
porque **desenham janelas diferentes**. Um gerador que inventa números publica o mesmo par nos dois
painéis — foi exatamente o que a Rev. 2 fez. **Dois números que discordam pelo motivo certo são
evidência mais forte que dois números que concordam.**

⚠️ **Um dos numerais não autorizados estava CERTO, e registro isso contra mim:** `lag-1 autocorr:
0.9989` não estava no meu prompt e o gerador o escreveu mesmo assim. Eu o recomputei
(`0.9989`, `n=850`) e **reproduz**. Mantive-o. **Acertar por sorte não valida o processo** — se a
auditoria fosse por amostragem em vez de exaustiva, o `842` teria passado junto.

---

## R2.2 Os 4 bloqueantes, um a um, com a medição que os fecha

### `M-1` — **FECHADO.** Todo numeral renderizado rastreia a uma medição

```bash
# extrai TODO numeral do texto renderizado (comentarios, <script> e <style> removidos)
python3 - <<'PY'   # saida integral conferida item a item
import re; from collections import Counter
s=re.sub(r'<!--.*?-->','',open('/tmp/ls-study-r2f.html').read(),flags=re.S)
s=re.sub(r'<(script|style)\b.*?</\1>','',s,flags=re.S)
print(Counter(re.findall(r'\d[\d.,]*%?', re.sub(r'<[^>]+>',' ',s))).most_common())
PY
```

**`n=37` numerais distintos, e cada um tem origem:** `1.1395` `1.8369` `0.6974` `1,6575` `42,08%`
`1.4950` `1.8098` `0.3148` `45,1%` `1.8114` `0.3164` `45,4%` `1.5164` `850` `2999` `5760` `849`
`2997` `5758` `48` `0.9989` `0.88` `0` — **medidos**; `1,0000` — **constante de definição**
(equilíbrio), não medição; `1m16s` `4m55s` — medidos; `2.4.0` `7f3a9c1` `1280x1024` `15` `4` `5`
`2` — chrome e rótulos de prazo (ver `c-6`).

**A contradição interna da rodada 1 morreu:** o eixo imprime `1.8369` no topo e o rodapé declara
máximo `1.8369`. Os dois concordam porque saem da mesma medição.

⚠️ **E aqui tarjo um erro DA RODADA 1, em vez de apagá-lo (`CLAUDE.md`, "erro não se apaga, se
tarja"):** o `M-1` da rodada 1 mandou trocar `6.1% da escala` por **`3.71%`**. **`3.71%` também está
errado** — ele foi obtido dividindo `0.0259` (a amplitude de 4 h **fabricada pela própria tela**) por
`0.6974` (a amplitude real). **O laudo consertou o denominador e herdou o numerador falso.** A
amplitude de 4 h medida é **`0.3148`**, e a fração é **`45,1%`** — mais de **12×** o que a rodada 1
publicou como remédio. **É a mesma classe de defeito que o `M-1` acusava, cometida dentro da
acusação**, e ela sobreviveu porque eu reusei um número em vez de remedi-lo.

### `M-2` — **FECHADO.** A geometria, não a prosa, é que prova

```bash
# primitivas SVG do painel do Estado 2, linhas de grade (#222634) excluidas
<path d="M 0,165 Q 180,140 380,110 T 700,75 T 880,50 L 990,42" stroke="#e6e9ef" stroke-width="1.5">
<circle cx="990" cy="42" r="3" fill="#e6e9ef">
```

**A linha termina em `x=990` e o marcador do último ponto observado está em `x=990`. Não existe
NENHUMA primitiva desenhada à direita disso** — nem tracejado, nem área, nem ponto fantasma. O
tracejado horizontal de `1060→1180` da rodada 1 sumiu. Os dois únicos `stroke-dasharray` que
sobraram no painel são as linhas de **grade de fundo** em `#222634`, horizontais e de largura total.

⇒ **o carry-forward que `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` proíbe no servidor deixou de
existir em pixels.** A ausência é dita por travessão na leitura, `—` na etiqueta do eixo
(`— fecho ausente`), a palavra no rodapé (`ausência não interpolada nem carregada adiante`) e —
**novo e medido** — `cauda ausente: 2 grades de 1m`.

### `M-3` — **FECHADO.** Procedência saiu inteira do estado vazio

```
Estado 3, texto renderizado: contagem de "OBSERVADO" = 0 · contagem de "procedênc" = 0
```

Nenhum rótulo, nenhum valor, nenhum travessão de procedência, nenhum "sem procedência". A afirmação
migrou inteira para o canal de integridade, e ele está nos três canais **na ordem certa**:

```html
<polygon fill="none" points="6,1 11,6 6,11 1,6" stroke="#e0aaff" stroke-width="1.5">
<span style="color:#e0aaff; font-weight:700">SEM OBSERVAÇÃO NA JANELA</span>
```

**Losango VAZADO (`fill="none"`) + palavra + violeta** — a cor é o terceiro canal, e o losango nunca
preenche área, como o §9 item 4 exige. Os Estados 1 e 2 **continuam** imprimindo
`procedência: OBSERVADO`, porque neles há observação da qual isso é predicado.

### `M-4` — **FECHADO.** Zero alpha no documento inteiro, e o piso volta com folga

```bash
grep -oc 'opacity' /tmp/ls-study-r2f.html   # 0
grep -oc 'rgba('   /tmp/ls-study-r2f.html   # 0
grep -oc 'backdrop'/tmp/ls-study-r2f.html   # 0     (gradient: 0 · box-shadow: 1, e e' "none !important")
```

| marca | contraste contra o plot `#131722` | piso | veredito |
|---|---:|---:|---|
| **borda da faixa** `#8b949e` sólido | **5.82** | 3.0 | **PASSA**, folga de 2.82 |
| o composto da rodada 1 `#8b949e @50% = #4f5660` | 2.41 | 3.0 | **não existe mais na tela** |
| tinta fraca `#8b949e` sobre plot / chrome | 5.82 / 6.19 | 4.5 | PASSA |
| tinta forte `#e6e9ef` sobre plot / faixa | 14.72 / 12.38 | 4.5 | PASSA |
| violeta `#e0aaff` sobre plot / chrome | 9.68 / 10.30 | 4.5 | PASSA |
| **fill da faixa** `#222634` | **1.19** | 3.0 | **e isto está CERTO** — ver abaixo |

⚠️ **O `1.19` do fill NÃO é reprovação, e registro de novo para que a conclusão errada não seja
redescoberta:** `SC 1.4.11` alcança objeto gráfico **necessário para entender o conteúdo**. A
fronteira da faixa é necessária e mede **5.82**; o fill só **agrupa**. Mesma leitura vale para as
linhas de grade de fundo (`#222634`, também `1.19`): quem carrega o valor é a **etiqueta do eixo**,
não a linha. Um auditor futuro que meça só os fills vai concluir que a tela reprova — **ela não
reprova, porque a informação não está nos fills.**

---

## R2.3 `S-5` a `S-9` — todos resolvidos, cada um com o comando

| item | medição na Rev. 3 |
|---|---|
| `S-5` | `QUARENTENA` **renderizada: 0**. A única ocorrência no arquivo está **dentro de comentário HTML**. A palavra do Estado 3 é `SEM OBSERVAÇÃO NA JANELA` |
| `S-6` | `idade` no Estado 3: **0**. Os carimbos renderizados são **2**, um por painel **que tem observação**, na borda direita do tempo — exatamente o que o §9 item 10 manda |
| `S-8` | `font-size` distintos no documento inteiro: **`12px` (48×), `13px` (6×), `14px` (2×)**. **Zero nó abaixo de 12px** — a rodada 1 tinha 16 a 9px e 14 a 10px |
| `S-9` | `<h1>` ×1 → `<h2>` ×3 (sem salto de nível) · `aria-label` ×3, um por `<section>`, todos descritivos e únicos · `aria-hidden` ×6 · landmarks `<header>` `<main>` `<footer>` presentes. A rodada 1 tinha **0** de cada |

### `S-7` — resolvido, e o ganho é medido, não afirmado

A régua saiu de dentro do domínio e virou **rótulo de borda**: `▼ 1,0000 equilíbrio · abaixo da
base`, abaixo da marca `1.1395`. A escala é autoescala pura `1.1395..1.8369`. Marcas do eixo:
`1.8369` · `1.6575` · `1.4950` · `1.1395` — **nenhuma fora do domínio**.

| escala | domínio | 15 min: excursão mediana | 15 min: janelas sub-pixel |
|---|---:|---:|---:|
| **ancorada em 1.0000** (rodada 1) | `0.8369` | `0.74 px` | **`33.7%`** |
| **autoescala pura** (rodada 2) | **`0.6974`** | **`0.88 px`** | **`25.5%`** |

⇒ **8,2 pontos percentuais de janelas de 15 min saíram do regime sub-pixel, e 19% de resolução
vertical voltaram.** O operador não perdeu o lado do equilíbrio — ele está no rótulo de borda.
`[NÃO MEDIDO]` se o rótulo de borda basta **cognitivamente**; isso só se responde observando uso, e
continua sendo a pergunta de `Explore`.

---

## R2.4 ⛔ O que a rodada 1 aprovou — RE-MEDIDO, e nada regrediu

| eixo protegido | medição na Rev. 3 | veredito |
|---|---|---|
| paleta canônica | **6 hexes, e só 6**: `#8b949e`(79) `#e6e9ef`(38) `#222634`(26) `#e0aaff`(10) `#0d1017`(10) `#131722`(5). Zero revogado, zero superfície inventada | **mantido** |
| os 14 desvios do item 16 | `0/14` — `lang="pt-BR"`, `<title>` em português, acentuação correta, zero sino, zero login, zero `overflow-y-auto`, zero microcopy em inglês, `MAINNET` preservado | **mantido** |
| `SC 1.4.1` por construção | `grep -c '#089981\|#f23645'` → **0**. Coorte ≠ direção: zero verde, zero vermelho na tela inteira | **mantido** |
| **e agora DEMONSTRADO por ablação, não só argumentado** | substituí todo hex pelo cinza de mesma luminância: sobram **6 cinzas distintos**, o **losango vazado sobrevive (3×)**, a **palavra sobrevive (2×)** e o **travessão sobrevive (7×)** ⇒ nenhuma informação vive só na cor | **reforçado** |
| faixa carregada pela BORDA | fill `#222634` (1.19) + `border-left`/`border-right` **`1px solid #8b949e`** (5.82), sem alpha | **mantido** |
| completude com os dois números | `850 observações nativas de 5m` em **tinta forte** + `(2999/5760 grades de 1m)` em **tinta fraca, entre parênteses** | **mantido** |
| travessão do `SEM_PONTO` em três lugares | leitura atual `—`, etiqueta do eixo `— fecho ausente`, fecho do plot. **Nenhum `0`, nenhum `--`, nenhum valor velho reaproveitado** | **mantido** |
| ganchos de teste | `data-testid="long-short-pane"` + `data-long-short-native-bars="850"` + `data-long-short-wire-points="2999"`, **byte-idênticos** | **mantido** |

⭐ **E confirmei que os dois `data-testid` NOVOS não quebram o e2e:**
`14-long-short-dado-real.spec.ts:496` usa `page.locator('[data-testid="long-short-pane"]')` com
`toHaveCount(1)`. O seletor de atributo CSS `=` é **igualdade exata**, então
`long-short-pane-empty` e `long-short-pane-no-point` **não casam** — `toHaveCount(1)` continua
verdadeiro. **Medido lendo o seletor, não suposto.**

---

## R2.5 `/accessibility-check` — WCAG 2.2 AA sobre a Rev. 3

### Nível de conformidade: **AA**, com 0 crítico · 0 sério · 3 moderados · 1 menor

**Passa:** `1.3.1` (landmarks + `h1→h2×3` sem salto + `aria-label` único por `<section>`) ·
`2.4.1` · `2.4.6` · `1.4.3` (o pior texto mede **5.82**) · `1.4.11` (a fronteira mede **5.82**) ·
`1.4.1` (demonstrado por ablação) · `2.4.4` (link descritivo, `rel="noopener noreferrer"`) ·
`3.1.1` (`lang="pt-BR"`) · `2.3.3`/`2.2.2` (zero animação) · `1.4.12` (`line-height: 1.35`).

| # | achado | critério | conserto |
|---|---|---|---|
| **`A-1`** | os **3 `<svg>` do losango de integridade** não têm `aria-hidden`, `role` nem nome acessível | `1.1.1` (A) | `aria-hidden="true" focusable="false"` no `<svg>` |
| **`A-2`** | **zero regra de `:focus`/`outline` no documento** — o §9 item 7 faz `outline-offset > 0` ser **requisito**, não estilo | `2.4.7` (AA) atendido pelo default do navegador; **a regra do projeto não está expressa** | escrever a regra, com o vão em cor de superfície |
| **`A-3`** | `body { width:1280px; height:1024px; overflow:hidden }` ⇒ a 200% de zoom o conteúdo **corta** | `1.4.4` / `1.4.10` | inerente a estudo de forma de canvas fixo; **vira defeito se a forma migrar para a `S2`** |
| **`A-4`** | `body { user-select: none }` — **o operador não consegue copiar um numeral** | fora de AA; é **defeito de produto** | remover `user-select: none` do texto (mantê-lo só no plot, se preciso) |

⚠️ **`A-1`: por que classifiquei como should-fix e não como must-fix, e onde posso estar errado.**
`1.1.1` é **nível A**, e uma leitura estrita diria must-fix. Classifiquei abaixo disso porque **a
informação não se perde**: a palavra `SEM OBSERVAÇÃO NA JANELA` está no MESMO contêiner, a 6px do
glifo — é o caso canônico de gráfico decorativo, e o conserto é **um atributo**. **O falsificador:**
rodar NVDA/VoiceOver na tela; se algum anunciar um "graphic" solto **sem** a palavra adjacente logo
em seguida, **`A-1` vira must-fix e este `APPROVED` tem de ser revisto**. `[NÃO MEDIDO]` — não há
leitor de tela neste ambiente.

⚠️ **`A-4` é achado NOVO, e ele é uma FALHA DA RODADA 1.** O `select-none` já estava na Rev. A
(`ls-study.html:51`, na classe do `<body>`) e **eu não o vi** — auditei tamanho de fonte e contraste,
não seleção de texto. Num produto cuja tese é *"impedir que um número sem procedência chegue a uma
decisão"*, **impedir que o operador copie o número para conferir fora da tela trabalha contra a
tese.** Registro como achado da rodada 2 e como lacuna da rodada 1.

**Testes que este gate NÃO substitui:** leitor de tela real · navegação só por teclado · zoom 200% ·
simulação de dicromacia. Os quatro continuam `[NÃO MEDIDO]`.

---

## R2.6 `/design-critique` — as 10 dimensões, rodada 1 → rodada 2

| dimensão | r1 | **r2** | o que mudou |
|---|---:|---:|---|
| Clarity | 6 | **8** | o rodapé reproduz; perde por exigir que o leitor note que E1 e E2 desenham janelas diferentes (o `(truncada)` carrega isso) |
| Consistency | 8 | **9** | 6 hexes, `0/14` desvios, zero alpha; sobra a classe CSS `.badge-quarentena` (`c-5`) |
| Hierarchy | 8 | **8** | inalterado — tinta forte para a manchete, fraca para a escada |
| Efficiency | 8 | **8** | inalterado — tudo visível sem hover |
| Accessibility | 4 | **7** | landmarks + headings + rótulos + piso de 12px + zero alpha; perde por `A-1`…`A-4` |
| Emotional Design | 8 | **8** | inalterado — zero ruído afetivo |
| Error Resilience | **3** | **9** | **o maior salto, e é o eixo que reprovava**: carry-forward eliminado (geometria conferida), `OBSERVADO` fora do vazio, ausência dita por palavra + glifo + travessão |
| Cognitive Load | 6 | **7** | cabeçalho em duas linhas, piso de 12px; ainda são 7 campos por painel |
| Innovation | 8 | **8** | faixa + rodapé numérico mantidos, agora com o equilíbrio como rótulo de borda |
| Polish | 5 | **8** | a régua deixou de derrotar a si mesma; todo numeral rastreia a uma medição; sobram os placeholders de chrome (`c-6`) |

**Média: 6,4 → `8,0`/10.**

### Could-improve

- **`c-5`** — a classe CSS chama-se `.badge-quarentena`. **Não é renderizada**, então não é defeito
  de usuário, mas o vocabulário errado que `S-5` derrubou **sobreviveu no identificador**. Quem
  transcrever o HTML para `.tsx` reintroduz a palavra.
- **`c-6`** — o chrome publica `v2.4.0` e `bundle 7f3a9c1`: **placeholders que nenhuma medição deste
  repositório produziu**. Não são numeral de mercado (o selo de 4 campos não os alcança), mas são
  exatamente a superfície onde `M-1` nasceu. ⭐ **E há um acerto novo a não regredir:** o chrome
  agora traz **`AO VIVO`**, que a rodada 1 registrou faltando em `m-10`.

### Explore

1. O rótulo de borda `▼ 1,0000` basta cognitivamente, ou o operador precisa da linha no domínio?
   **`[NÃO SEI]`** — mede-se observando uso, não argumentando.
2. Dois painéis lado a lado publicando pares de 4 h diferentes é **correto e potencialmente
   confuso**. `[NÃO MEDIDO]` se o sufixo `(truncada)` basta para desarmar a leitura de erro.

---

## R2.7 ⛔ O FALSIFICADOR DA RETA, DEPOIS DO `S-7` — **CONTINUA DISPARANDO, e agora com menos folga**

> *"se o painel de `count_long_short_ratio` for uma linha **VISUALMENTE PLANA** no timeframe de
> operação (`15min..4h`), a fatia ACRESCENTA `sum_taker_long_short_vol_ratio` como SEGUNDA série
> do MESMO painel"* — `tasks.toml:T-04.9`

**Medido sobre a mesma leitura de produção (`n=850` nativas, 4 dias), com autoescala pura — isto é,
COM o `S-7` já aplicado. Janelas fixas não sobrepostas, baldes parciais de borda descartados
(é o método da rodada 1; mantê-lo é o que torna as duas rodadas comparáveis):**

| janela | n | excursão mediana | janelas sub-pixel (< 0,5 px) |
|---|---:|---:|---:|
| **15 min** | 282 | **`0.88 px`** | **`25.5%`** |
| 1 h | 72 | `4.80 px` | `0.0%` |
| 4 h | 19 | `13.18 px` | `0.0%` |

⇒ **VEREDITO: dispara no piso da banda (15 min), não dispara no teto (1 h e 4 h).** Exatamente a
mesma forma da rodada 1 — **o `S-7` melhorou o número (33,7% → 25,5%) e não cruzou o limiar**: a
mediana de 15 min continua **abaixo de um pixel** e **um quarto** das janelas não move meio pixel.

⚠️ **Nota de método, contra mim:** medindo **com** os baldes parciais de borda, o 4 h dá
`11.97 px / 4.8%` em vez de `13.18 px / 0.0%`. Os `4.8%` são **1 balde de 21**, artefato de recorte.
Publico os dois para que ninguém redescubra a discrepância como se fosse mudança da série.

**E as três razões da rodada 1 para NÃO acrescentar a segunda série continuam de pé, uma delas
re-medida agora:**

1. a segunda série entraria na **mesma escala comprimida** — o remédio não toca o denominador;
2. ⛔ **a série não existe no catálogo servido**, e reconferi **hoje**:
   `GET /api/v1/series-catalog` → `n_entries=60`, **7 métricas**, e
   `sum_taker_long_short_vol_ratio` **não é uma delas** `[MEDIDO 2026-09-16]`. O remédio que a fase
   pré-autorizou **não tem dado**;
3. a resposta certa é a faixa + o rodapé numérico — **e agora eles publicam número que reproduz**,
   que era precisamente o que faltava.

**⇒ A proposta a `T-04.9` continua a mesma, e continua NÃO EXECUTADA:** trocar o gatilho de *"a
série é plana ⇒ acrescente uma segunda série"* para *"a série é plana **na escala entregue** ⇒
conserte a escala"*, reapontando para o `M-2` transversal de `gates/design-05.md`
(*"a janela declarada não é a janela desenhada"*). **`tasks.toml` é plano de fase e esta rodada está
proibida de tocá-lo** — a decisão é de quem é dono da fase.

---

## R2.8 Registro de execução da rodada 2

| item | estado |
|---|---|
| tela Rev. 2 (intermediária) | `0738eb77a1924bcdad22e02f88fbd349` — `generate_screen_from_text`, prompt de **33 453 B** = §9 **verbatim** (272 linhas / 19 455 B, `startswith` conferido, `R3`) + instrução de 14 KB |
| tela Rev. 3 (**a julgada**) | `7d87cac18168441cb538a78746709282` — `edit_screens` com §9 **verbatim** de novo + a correção dos 6 numerais do §R2.1 |
| `modelId` | ⛔ **`GEMINI_3_1_PRO` recusado outra vez** — `"Request contains an invalid argument."` O enum do MCP tem 3 membros e nenhum é ele. **Pendência de `R1` continua com o owner** (§0.1 da rodada 1). Geração feita no default do servidor (`"agentType":"PRO_AGENT"`) |
| `edit_screens` sobre a `S2` canônica | **NÃO executado** — `R7` (`S2` é BLOCKER) e `R5` |
| descoberta shadcn | `get_project_registries` → **nenhum registry configurado** (reconferido). ⇒ não aplicável a um painel que é `<canvas>` + texto |
| Figma | **nenhuma chamada** |
| `frontend/` · `scripts/` · `docs/plans/` · `tasks.toml` | **intocados** |
| commits | **nenhum** |
| `gate-record` | **NÃO gravado** — ato do owner |
| `verify_screen.py` | `REPROVADO (9 reprovações)` — **as mesmas 9 da rodada 1, e as 9 continuam sendo falso negativo estrutural** (o script é calibrado para a `S2` inteira, com candles e painel de preço; um `ratio` não tem OHLC). ⭐ **E o bug `E6` da rodada 1 REPRODUZIU**: o script conta **3** carimbos de idade, mas `\bidade\b` com `re.I` está casando com a palavra `Idade` **dentro de um comentário HTML** — os renderizados são **2**, um por painel com observação, que é o que o §9 manda. Não corrigi: `scripts/` está fora do escopo desta rodada |

### R2.9 Proposta a `docs/product/STITCH_CONTEXT.md` — **redigida, NÃO aplicada** (`R6`)

| § | mudança proposta |
|---|---|
| linha 4 | a contagem diz `7`; eram **10** antes desta rodada e são **12** depois. **Trocar a contagem por uma lista de `screenId`** — a TARJA de 2026-08-28 daquele arquivo já disse por quê: *"um id não envelhece; uma contagem sim"*, e esta é a **terceira** rodada seguida em que a contagem chega desatualizada |
| §4.1 | registrar `7d87cac1…` como **estudo de forma** do painel de long/short — **não** como tela canônica: não é uma `S2` e `verify_screen.py` não a arbitra |
| §5 / linha 48 | `[NÃO SEI]` o que fazer com `GEMINI_3_1_PRO`. É `[PREMISSA-OWNER]` e **só o owner a reescreve** |

⛔ **Nenhuma linha de `docs/product/` foi alterada nesta sessão.**

---
---

# RODADA 3 — `2026-09-16` · **a TELA IMPLEMENTADA, não o estudo. R1 e R2 permanecem intactas**

**Cabeça julgada:** `da2ef79` · **Branch:** `task/cinco-metricas-do-core-f04-front`
**⛔ MUDANÇA DE ARTEFATO, e ela é a razão desta rodada existir:** `R1` e `R2` julgaram telas do
**Stitch** (`687b6958…`, `7d87cac1…`) com `frontend/` **declaradamente intocado**. Esta rodada julga
**`LongShortPane` renderizado pela rota real** — `SymbolClient.tsx:1811-1914`, entregue por `fa16c15`
(**+405 linhas**), servido por um `next start` desta árvore na porta **`4997`** contra a API de
produção em `:8000`. O resíduo que a pediu está nomeado em
[`gates/F04-T-04.9-fechamento-vertical.md`](F04-T-04.9-fechamento-vertical.md) §5.

⚠️ **`:3000` NÃO foi usada** — ela serve o container de produção, que não tem este branch; medir ali
mediria outro código. O processo da `4997` foi **derrubado ao fim** (§R3.9).

⛔ Nada commitado · `frontend/`, `scripts/`, `docs/product/`, `docs/plans/` e `tasks.toml`
**intocados** · **nenhuma** chamada de Figma · `gate-record` **NÃO gravado** (ato do owner) ·
Postgres **não tocado** (só `GET` na API).

## VEREDITO DA RODADA 3: **APPROVED**

| | |
|---|---|
| **must-fix** | **0** — nenhuma afirmação falsa na tela viva; `M-1`…`M-4` e `A-1`…`A-4` re-medidos |
| **should-fix** | **3** (`D-1` · `D-2` · `D-3`), e **dois deles são divergências que ninguém declarou** |
| **could-improve** | **1** (`d-4`) |
| **⚠️ tarja contra mim** | o `§7.1` da rodada 1 e o `§R2.7` da rodada 2 **subestimaram a planura** — geometria errada (§R3.6) |

⇒ **A tela implementada honra o que o §R2 aprovou** na parte que reprovava: **zero afirmação
falsa**. **12 de 12 numerais do rodapé reproduzem contra a API, ao dígito** (§R3.2) — e reproduzem
**derivados**, não transcritos: em duas leituras separadas por minutos a mediana mudou de `1.6575`
para `1.6567` e o `n` de `3064` para `3068`, enquanto `min`/`max` de 4 dias não mudaram. Um literal
ou um `toFixed` congelado dariam o mesmo número nas duas.

---

## R3.1 O que eu medi, e contra o quê

| eixo | instrumento | resultado |
|---|---|---|
| numerais do rodapé | réplica de `resolveRouteWindow` + `GET /api/v1/series-history` | **12/12 idênticos** (§R3.2) |
| geometria do plot | `boundingBox` do `<canvas>` na rota real, Playwright | `1208 × 192` ⇒ plot **`134,4px`** (§R3.6) |
| tipografia | `getComputedStyle` de **todo nó de texto** do painel | `14px` ×38 · `16px` ×1 · **`11px` ×3** (`D-2`) |
| contraste | luminância relativa calculada no navegador | fraca **5.82 / 6.19** · forte **14.72 / 15.65** |
| alpha | `opacity`/`backdropFilter` de todo descendente | **`[]` — zero** |
| seleção de texto | `userSelect` de todo nó de texto | só um `<style>` da biblioteca é `none`; **todo numeral é copiável** (`A-4` ✅) |
| foco | `Tab` ×14 + `getComputedStyle` do elemento focado | **`outline: 2px solid`, `offset: 2px`** em todos (`A-2` ✅ **em runtime**, não só no CSS) |
| reflow | viewport `640×1024` (= 200% de zoom de 1280) | texto **envolve**; o `<canvas>` **não** (`D-3`) |
| contrato de forma | `node --test long-short-pane-design-contract.test.ts` | **17 pass, 0 fail** (rodado por mim) |
| `ratio-format` | `node --test ratio-format.test.ts` | **0 fail** |

## R3.2 `M-1` na tela viva — a auditoria exaustiva, de novo, e desta vez ela não mordeu

Leitura da página e da API na **mesma janela alinhada** (réplica de `resolveRouteWindow`: lag `5min`,
span `5760min`, alinhamento `5min`, `knowledge_time = endEx + 4min`):

```
TELA : Escala da janela: 1.1395 a 1.8369 · amplitude 0.6974 (42,1% da mediana 1.6567) · n = 3068 grades legíveis
API  :                   1.1395 a 1.8369 · amplitude 0.6974 (42,1% da mediana 1.6567) · n = 3068
TELA : Últimas 4 h: 1.495 a 1.5867 · amplitude 0.0917 (13,1% da amplitude da janela) · n = 168 grades legíveis
API  :              1.495 a 1.5867 · amplitude 0.0917 (13,1%)                          · n = 168
TELA : 870 observações nativas   API: available_at distintos = 870
```

⭐ **E o `M-1` deixou de ser vigilância e virou impossibilidade estrutural**, que é a diferença entre
a Rev. 2 (6 numerais fabricados, pegos só porque a auditoria foi exaustiva) e isto: os valores saem
de `view-model.ts::seriesValueStats` sobre **os mesmos slots que o gráfico desenha**, o arredondamento
sai de `ratio-format.ts::formatDerivedDecimal` (precisão dos **operandos**, não `toFixed` congelado) e
`long-short-pane-design-contract.test.ts` **reprova** se qualquer um dos 9 numerais que este gate
mediu por fora aparecer literal no componente. **Plantei a mutação e ela morde** — `T-04.9` §5 a
replantou em `{windowStats.min}` → `1.1395` e obteve `16 pass, 1 fail`.

⚠️ **Uma diferença de 1 grade que NÃO é defeito, registrada para não ser redescoberta como se
fosse:** numa leitura anterior contei `168` contra `169` da tela porque usei `>` onde
`slotsFrom(slots, windowEndMsInclusive − 4h)` é **inclusivo**. Com `>=` e janelas alinhadas, `168 =
168`. A acusação errada era minha, não da tela.

## R3.3 `M-2`, `M-3`, `M-4` e `SC 1.4.1` na implementação

| item | como se sustenta aqui |
|---|---|
| `M-2` (sem carry-forward) | `lineSeriesLossless` transforma slot ausente em `WhitespaceItem` — a biblioteca **não desenha nada**; o painel ainda **conta** a cauda (`long_short_tail_absent:0` hoje, dito em palavras) e o contrato reprova `LineStyle.Dashed`/`lastValueVisible: true`. Não há tracejado à direita porque não há primitiva à direita |
| `M-3` (procedência não predicada do vazio) | `hasObservation = windowStats !== null` é a **única** condição que governa `LongShortProvenance`, `LongShortAgeStamp` e o selo de integridade. Hoje há observação ⇒ `Procedência: OBSERVADO — dado da própria fonte (binance)` é predicado de algo |
| `M-4` (sem alpha) | **`opacity !== 1` em zero descendentes**, medido no navegador; **zero hex literal** no painel (`grep -c '#[0-9a-fA-F]{6}'` no bloco `1495-1914` → `0`) — a tinta sai de `colorTokens()` |
| `SC 1.4.1` | **zero** nó com verde/vermelho de direção; coorte continua não sendo direção |

⚠️ **O estado vazio (`M-3`/`S-5`/`A-1`) NÃO foi medido em runtime, e o motivo é uma regra deste
repositório, não preguiça:** produzi-lo exigiria semear dado no Postgres **compartilhado** — proibido.
Fica sustentado por fonte + pelos 17 asserts do contrato. `[NÃO MEDIDO em runtime]`.

## R3.4 Os 4 should-fix da rodada 2 — entraram, e 3 eu verifiquei na tela viva

| item | veredito | medição |
|---|---|---|
| `A-1` (`1.1.1`) | **entrou** | `LongShortIntegrityGlyph` tem `aria-hidden="true" focusable="false"` e segue **vazado** (`fill="none"`). ⚠️ só existe no estado vazio ⇒ verificado por fonte + contrato, **não** em runtime |
| `A-2` (`2.4.7`) | **entrou, e verificado NO NAVEGADOR** | `Tab` ×14: todo elemento focado resolve `outline: 2px solid`, `outline-offset: 2px`. O anel é `#8b949e` sobre `#0d1017` = **6.19** ⇒ passa `1.4.11` com folga |
| `A-3` (`1.4.4`/`1.4.10`) | **entrou PELA METADE**, e a metade que falta não é deste painel | a 640px (200% de zoom) **todo `<p>` do painel envolve** dentro da moldura; o `<canvas>` **não** (`D-3`) |
| `A-4` (produto) | **entrou** | único `user-select: none` da árvore é um `<style>` injetado pela `lightweight-charts`; **todo numeral visível é selecionável** |

## R3.5 ⚠️ As divergências — uma declarada e defensável, DUAS que ninguém declarou

### `D-0` — o rótulo de equilíbrio DERIVADO: **defensável, e eu o teria exigido**

O estudo escreve fixo `▼ 1,0000 equilíbrio · abaixo da base`. `equilibriumPlacement` deriva
`below`/`inside`/`above` do domínio medido. Na tela viva:
`▼ 1,0000 equilíbrio de contas (constante de definição, não medição) — abaixo da base da escala desenhada`.

**Aprovo, e por três razões medidas, não por cortesia:**

1. **a frase transcrita seria o `M-1` de novo.** `min = 1.1395` é verdade **destes** 4 dias; na
   primeira vez que a razão negociar abaixo da paridade — estado normal — o estudo afirmaria posição
   que nada mediu. Recusar afirmação falsa é a **regra** deste gate, e ela não tem exceção para
   afirmação falsa que EU aprovei;
2. **a FORMA que o `S-7` comprou sobreviveu inteira**: continua sendo **rótulo de borda**, fora do
   domínio, a escala continua autoescala pura, e o glifo (`▼`/`▲`/`◆`) é `aria-hidden` — a palavra
   carrega o sentido. O que mudou é a **sentença**, não a decisão de forma;
3. e o builder acrescentou o que o estudo **não** dizia — `(constante de definição, não medição)` —
   que é exatamente a distinção que o `§R2.2` teve de fazer à mão ao auditar os 37 numerais.

⇒ **`D-0` não é divergência a corrigir; é a decisão certa, e o registro de que o validador concordou
DEPOIS é o que faltava** (`CLAUDE.md` §Design: *"nenhuma decisão de design vale antes de o validador
concordar"*). **Concordo agora, e esta linha é esse ato.**

### `D-1` — should-fix. **A FAIXA DAS 4 H NÃO FOI IMPLEMENTADA**, e ninguém declarou isso

O estudo aprovado desenha a faixa **duas vezes** (`design-04-rev3.html:260` e `:360`):

```css
.four-hour-window { background-color:#222634; border-left:1px solid #8b949e; border-right:1px solid #8b949e; }
```

**O painel implementado não tem banda nenhuma:** `LongShortPane` cria **uma** série `Line` e chama
`setData`; **zero** `createPriceLine`, `setMarkers`, `AreaSeries` ou sobreposição
`[MEDIDO: bloco 1811-1914]`. O recorte das últimas 4 h existe **só como texto no rodapé**.

**Por que importa:** o `§2.3` da rodada 1 chamou a faixa de melhor decisão da tela **e o motivo era
medido** — a fronteira é o único elemento que delimita a janela de decisão e ela mede **5.82** contra
o plot, enquanto o fill mede `1.19`. Sem a faixa, o operador lê *"últimas 4 h: amplitude `0.0917`"* e
**não consegue apontar no gráfico onde essas 4 h começam**.

⚠️ **E isto corrige uma afirmação de `T-04.9` §7.3**, que registra o remédio de `D18` como *"faixa de
4 h + rodapé numérico … ENTREGUE"*. **Metade está entregue.** O que aquele laudo verificou no DOM
foram as **duas linhas de rodapé**, que existem; a faixa, não. Tarjo em vez de apagar.

**Por que mesmo assim é should-fix e não must-fix:** a redação em vigor do falsificador é
`[DECISÃO-OWNER: 2026-09-16, §D18]` — *"dizer **quanto** a série andou no prazo de decisão, sem exigir
zoom"*. O rodapé **diz quanto**, com `n` declarado e número que reproduz. A faixa responde **onde**,
que `D18` não pede. ⇒ nenhuma afirmação falsa, informação presente em texto.
**Falsificador de `D-1`:** ponha o operador diante da tela e peça que aponte o início das últimas
4 h. Se ele precisar contar marcas de eixo, `D-1` vira must-fix. `[NÃO MEDIDO]`.

### `D-2` — should-fix. **3 nós a 11px**, abaixo do piso que o `S-8` fixou

```
font-size de TODO nó de texto do painel:  14px ×38 · 16px ×1 · 11px ×3
```

Os três `11px` são o `<h2>` do painel (`font-label-caps text-label-caps`). O `§R2.3` registrou a Rev. 3
com **zero nó abaixo de 12px**, e o comentário do próprio componente afirma *"every class here is
`text-sm` (14px) or the `label-caps` scale, and **nothing is smaller**"* — **a afirmação é falsa como
medida**: `label-caps` **é** 11px.

⚠️ **E a substância é defensável, o que a afirmação não é:** os **9** cabeçalhos da `S2` medem 11px
(`grep` de `getComputedStyle` sobre `h2,h3` da rota: `11px` ×9). O painel **conformou-se ao sistema**,
não ao estudo — que é a escolha certa numa migração, e o inverso criaria um cabeçalho fora de escala
no meio de oito irmãos. Contraste `14.72:1`, caixa alta, e **AA não fixa tamanho mínimo** ⇒ nenhum
critério reprova. **O defeito é a declaração, não o pixel:** o comentário afirma o contrário do que a
tela faz. ⇒ ou o comentário passa a nomear o desvio, ou o `S-8` passa a ler *"12px, exceto o token
`label-caps` do chrome da `S2`"*. **Decisão de quem for dono do `STITCH_CONTEXT.md` §9 item 14 — eu
proponho a segunda, e não a apliquei (`R6`).**

### `D-3` — should-fix **TRANSVERSAL, com dono que já existe** — o `<canvas>` não reflui a 200%

```
viewport 640×1024 (= 200% de zoom de 1280):
  documentElement.scrollWidth = 1280  contra  clientWidth = 640   ⇒ rolagem horizontal
  larguras de canvas: inalteradas (1224, 1202, 1208, 1194, …)
  elementos além da borda direita, por painel: oi 19 · cvd 19 · liquidation 38 · long-short 19
```

**`SC 1.4.10` (Reflow) reprova a ROTA**, e reprova **igual nos 4 painéis** — o gráfico é criado uma
vez com `container.clientWidth` e **não há `ResizeObserver`** em `frontend/src` fora do shim de teste.
⇒ **não é regressão de `fa16c15`**, e já tem endereço: `SymbolClient.tsx:382-385` cita `DR-4` de
`gates/design-review-painel-cvd.md` como item MEDIUM daquele roadmap. **O `A-3` deste gate está pago
no que era do painel** (moldura fluida, `flex-wrap`, sem `overflow:hidden`, sem largura fixa) — o
resíduo é do host de gráfico, e nomeá-lo aqui é o que impede que ele vire permanente por omissão.

### `d-4` — could-improve: o `<a id="tv-attr-logo">` da `lightweight-charts`

**6 na página, um por gráfico, e são os ÚNICOS elementos focáveis da rota inteira** — `Tab` ×14 só
visita eles. Nome acessível vem de `title="Charting by TradingView"` (⇒ `2.4.4`/`4.1.2` **passam**,
por `title`, que é o canal mais fraco). Injetado pela biblioteca, idêntico nos 5 painéis ⇒
**pré-existente e transversal**, não deste painel. Registrado porque um `Tab` que só encontra links de
atribuição é um sinal sobre a rota, não sobre o link.

## R3.6 ⛔ A GEOMETRIA REAL — e a tarja contra dois números MEUS

`R11` (`CLAUDE.md`, *"erro não se apaga, se tarja"*). **O `§7.1` da rodada 1 escreveu *"painel de
`220px`, área de plot `154px`"* e o `§R2.7` publicou `25,5%` sobre essa suposição. O `220` é o
argumento passado a `createChart`; o eixo de tempo come o resto.** Medido por mim na rota real:

```
boundingBox do <canvas> em [data-testid="long-short-pane"] => 1208 × 192   (atributo: 1208 × 192)
o <canvas> do eixo de tempo mede 1208 × 28, e 192 + 28 = 220
scaleMargins: o painel não declara ⇒ default 0.2/0.1  ⇒  plot = 192 × 0,7 = 134,4px
```

⇒ **`134,4px`, não `154px`: `12,7%` a menos de resolução vertical do que eu publiquei.** Achado
primeiro por `T-04.9` §7.2 e **reproduzido aqui por medição própria**, não importado.

**O efeito, com o MÉTODO DE `§R2.7` CONGELADO (janelas fixas não sobrepostas) — só a geometria muda,
`n=291` janelas de 15 min, dado de hoje:**

| escala | plot | 15 min: excursão mediana | 15 min: sub-pixel (`< 0,5px`) |
|---|---:|---:|---:|
| autoescala pura (`S-7` aplicado) | `154px` **(SUPOSTO)** | `0.88 px` | **`27,1%`** |
| **autoescala pura — a tela REAL** | **`134,4px`** | **`0.77 px`** | **`34,4%`** |
| ancorada em `1,0000` (o que o `S-7` recusou) | `154px` | `0.74 px` | `35,7%` |
| ancorada em `1,0000` | `134,4px` | `0.64 px` | `43,3%` |

**Três leituras, e a terceira é desconfortável:**

1. **a planura que publiquei estava SUBESTIMADA** — `25,5%` virou **`34,4%`**, quase **9 pontos
   percentuais** a mais de janelas de 15 min que não movem meio pixel;
2. **o `S-7` continua CERTO** — a geometria constante, autoescala bate a âncora em qualquer plot
   (`34,4%` contra `43,3%`; `27,1%` contra `35,7%`). A decisão não muda;
3. ⚠️ **mas o ganho que eu celebrei some na escala real:** o `§R2.3` comemorou `33,7% → 25,5%` como
   *"8,2 pontos que saíram do regime sub-pixel"*. Na geometria real a tela entregue está em
   **`34,4%`** — **pior que os `33,7%` que eu usei para condenar a alternativa**. O `S-7` melhorou a
   tela; **não a tirou do regime que ele existia para combater**, e a minha frase deixava entender
   que sim.

## R3.7 ⛔ O FALSIFICADOR, na redação `D18`, contra a TELA — **continua disparando, e mais forte**

> *"se o painel de `count_long_short_ratio` for uma linha VISUALMENTE PLANA **na escala entregue**, a
> fatia **CONSERTA A ESCALA** — dizer quanto a série andou no prazo de decisão, sem exigir zoom."*
> `[DECISÃO-OWNER: 2026-09-16, §D18]`

| horizonte | mediana (plot real `134,4px`) | sub-pixel |
|---|---:|---:|
| **15 min** (piso da banda) | **`0.77 px`** | **`34,4%`** |
| 1 h | `3.93 px` | `4,0%` |
| 4 h (teto) | `11.51 px` | `0,0%` |

⇒ **DISPARA no piso da banda operacional, e a geometria real o faz disparar com MENOS folga, nunca
mais.** No teto não dispara. Mesma forma das rodadas 1 e 2 — por três caminhos independentes (eu ×2,
`T-04.9` ×1) e agora sobre a tela viva em vez do estudo.

**A ação que `D18` prescreve está ENTREGUE — na metade numérica, que é a que ele pede.** O rodapé diz
`amplitude 0.0917 (13,1% da amplitude da janela) · n = 168 grades legíveis`, derivado dos mesmos slots
que o gráfico desenha, **sem exigir zoom**. A metade visual (a faixa) **não** está — é o `D-1`, e é
por isso que ele é should-fix e não cosmético.

**O resíduo que `T-04.9` §7 já declarou continua de pé, e a geometria real o agrava:** o rodapé
quantifica o **teto** (4 h), e a planura mora no **piso** (15 min). O owner escolheu com o número do
piso na frente — só que **o número que ele viu era `25,5%`, e o real é `34,4%`**. ⇒ **isto volta ao
owner como informação nova, não como decisão revogada.** Ação registrada no §R3.8.

## R3.8 O que esta rodada devolve, e para quem

1. **`D-1` (faixa das 4 h)** — dono: quem for construir a próxima passada de `web`. **Não bloqueia** a
   fase `04`; bloqueia a frase *"faixa + rodapé entregues"*, que fica tarjada aqui e em `T-04.9` §7.3.
2. **A correção de `25,5%` → `34,4%`** — dono: **o owner**, porque `D18` foi escolhido com o número
   antigo à vista. Não proponho reverter `D18`; proponho que ele saiba que a planura do piso é ~1/3
   das janelas, não ~1/4.
3. **`D-2`** — dono do `STITCH_CONTEXT.md` §9 item 14: ou o comentário do componente nomeia o desvio,
   ou o piso passa a excetuar `label-caps`. **Proponho a segunda; `R6` me proíbe de aplicar.**
4. **`D-3`** — já tem dono: `DR-4` de `gates/design-review-painel-cvd.md`.

## R3.9 Registro de execução da rodada 3

| item | estado |
|---|---|
| servidor medido | `next start` desta árvore, `127.0.0.1:4997`, `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000` · build `.next` desta árvore (`fa16c15`), conferido pelos marcadores de `fa16c15` no HTML servido |
| `:3000` | **não usada** — é o container de produção e **não tem este branch** |
| processo | **derrubado ao fim desta rodada** (`kill`, porta livre) |
| navegador | Playwright/Chromium, viewports `1280×1024` e `640×1024` |
| escrita | **somente** este arquivo, **somente** como `§R3`. `R1` e `R2` **não foram tocadas** (as 910 linhas anteriores estão byte-idênticas) |
| `frontend/` | **intocado** — outro agente audita o mesmo diff; `git status --porcelain` limpo fora deste `.md` |
| commits | **nenhum** |
| `gate-record` | **NÃO gravado** — ato do owner |
| Figma | **nenhuma chamada**, em nenhum momento |
| Stitch | **nenhuma geração** — o artefato desta rodada é código renderizado, não tela. ⇒ a pendência de `R1`/`GEMINI_3_1_PRO` (§0.1) **não foi exercida** e continua com o owner |
| Postgres | **não tocado**; nada semeado; API lida só por `GET` |

### O que esta rodada NÃO mediu, declarado

- **Leitor de tela, teclado com usuário real, dicromacia** — `[NÃO MEDIDO]`. O `Tab` foi exercido por
  script; o anel de foco foi **medido**, a experiência não.
- **O estado vazio e o `SEM_PONTO` em runtime** — exigiriam semear o Postgres compartilhado
  (proibido). Sustentados por fonte + 17 asserts + o universo FRACO do `make verify`.
- **Se o rótulo de borda basta cognitivamente** — continua `[NÃO SEI]` desde o `§R2.6 Explore`, e
  nenhuma das três rodadas o respondeu, porque nenhuma observou uso.

---
---

# RODADA 4 — `2026-09-16` · MICRO-RODADA `§R4` · **R1, R2 e R3 permanecem intactas**

**Escopo, e ele é estreito de propósito:** ratificar (ou não) **UMA** divergência de forma — a faixa
das 4 h implementada **só com as bordas, sem fill**. **Não é revisão completa da tela.** Nada além
desta pergunta foi julgado.

**Cabeça medida:** `05a7826` — ⚠️ o despacho disse `10fffdf`; o `HEAD` real tem um commit a mais.
**Conferido que ele não toca o artefato:** `git show --stat 05a7826` = **1 arquivo, `docs/`**
(`PENDENCIAS-PARA-AVALIAR-DEPOIS.md`, +22) ⇒ `frontend/` é byte-idêntico a `10fffdf`, e o julgamento
vale para os dois. **Registro em vez de assumir.**
**Artefato:** `LongShortRecentBand`, `SymbolClient.tsx:1920-1960`, na **tela renderizada**.
**Divergência julgada:** `T-04.10-achados-front.md` §2.3.

## VEREDITO DE `§R4`: **APPROVED** — a faixa sem fill fica

| pergunta do despacho | veredito |
|---|---|
| **(a)** a faixa sem fill honra o que `§R2`/`§R3` aprovaram? | **SIM.** A perda do agrupamento **não é material**, e o §R4.2 diz por quê com número |
| **(b)** ela é **visível** na tela real, por PIXEL? | **SIM.** **2 204 pixels** mudam quando ela sai. Duas colunas de **192 px** de altura, `#8b949e` **exato**, contraste medido **5.82** contra o plot |

⚠️ **E ratifico o RESULTADO corrigindo a JUSTIFICATIVA: a razão declarada como "física" está
superestimada** (§R4.3). Isso não muda o veredito — muda o que fica escrito como verdade.

## R4.1 A evidência de pixel — e ela é uma ABLAÇÃO, não uma asserção de DOM

O §2.4 de `T-04.10` provou que **toda** asserção de DOM desta faixa foi cega uma vez
(`toHaveCount(1)` ✔, `boundingBox 120×192` ✔, **zero pixel na tela**). ⇒ **não medi por DOM.**
Medi **removendo a faixa no browser e comparando os pixels compostos** — a única evidência que aquele
defeito não teria passado.

```
next start desta árvore em 127.0.0.1:4991 (:3000 é o container de PRODUÇÃO, não tem este branch)
INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000 · Chromium · viewport 1280×1024 · deviceScaleFactor=1
clip no host do gráfico = 1254×220 · screenshot COM a faixa → el.style.display='none' → screenshot SEM
decodificação PNG em python3 puro (zlib+struct; não há PIL nem numpy nesta máquina)
```

| medida | valor |
|---|---|
| pixels que **mudam** ao remover a faixa | **`2204`** |
| colunas com ≥ 80% da altura (as **bordas**) | **`x=1087` e `x=1206`**, **`192 px` cada** |
| cor composta da borda (`y=95`) | **`rgb(139,148,158)`** = **`#8b949e` exato** |
| pixel vizinho, fora da faixa | `rgb(19,23,34)` = `#131722` |
| **contraste medido no pixel composto** | **`5.82`** contra o plot |
| `background-color` / `opacity` computados | `rgba(0,0,0,0)` / `1` ⇒ **zero fill, zero alpha** |
| `z-index` da faixa vs maior canvas | **`10` vs `2`** |
| `data-fact` | `long_short_recent_band:5519/5759` ⇒ `240` grades = **4 h exatas** |

⭐ **O `5.82` medido no pixel é o MESMO `5.82` que o `§2.3` previu por cálculo, três rodadas antes.**
Previsão e medição independentes batendo no centésimo é a evidência mais forte deste gate — e ela
prova, de quebra, que **nenhum alpha sobrou na cadeia de composição** (`M-4` continua fechado **na
tela**, não só no HTML do estudo).

**Determinismo da ablação conferido:** o screenshot **restaurado** é **byte-idêntico** ao original
(`cmp` → sem diferença) ⇒ os `2204` são a faixa, não ruído de repintura.

## R4.2 (a) A perda do agrupamento **não é material** — três razões, todas medidas

1. **O fill nunca foi portador.** `§2.3`: fill `1.19` contra borda `5.82`. `1.19` está abaixo do piso
   `3.0` de `SC 1.4.11` **por um fator de 2,5** — por construção ele **não podia** carregar
   informação. Remover o que mede `1.19` remove **agrupamento**, não **fato**.
2. **A dívida que o `D-1` abriu está paga no canal exato que ela nomeou.** `§R3.5`: *"o operador lê
   'últimas 4 h: amplitude 0.0917' e **não consegue apontar no gráfico onde essas 4 h começam**"*.
   **Onde começam é a borda esquerda, e ela existe, em `192 px` de `#8b949e` a `5.82`.** O `D-1` não
   pediu região preenchida; pediu **fronteira localizável**.
   ⭐ **E a geometria explica por que uma borda basta:** a borda direita cai em `x=1206` de um plot de
   `1208px` — **2 px da margem**. A região é delimitada por **uma régua + a borda do "agora"**, que é
   a forma correta de uma janela *"últimas N horas"*: ela não tem duas fronteiras simétricas, tem uma
   fronteira e um presente.
3. **A implementação ACRESCENTA um canal que o estudo não tinha: a região é NOMEADA.** A tag
   `Últimas 4 h` é uma caixa **opaca de ~`91×20 px`** (`1820` dos `2204` pixels alterados, em `20`
   linhas). **Um rótulo que diz o que a região É agrupa mais que um fill de `1.19` que diz apenas que
   ela existe** — e, ao contrário do fill, **sobrevive inteiro à ablação de cinza**, porque é forma e
   palavra, não tinta de área. `#8b949e` tem croma de `19/255` (`7,5%`): é **luminância quase pura**,
   que é o canal que `ADR-010` §5.4 reserva para marca operacional.

**Prova aritmética de que não há fill escondido:** um fill de área teria alterado
`(1206−1087−1) × 192 = 22 656` pixels. Alteraram **`1820`** — **8,0%** disso, e todos na faixa de
`20` linhas da tag. **A tela não tem fill, e o número diz exatamente quanto de fill ela não tem.**

## R4.3 ⛔ A JUSTIFICATIVA do builder está SUPERESTIMADA — e ratificar sem corrigi-la seria o defeito

O §2.3 de `T-04.10` declara a divergência **"física, não estética"**: *"um overlay HTML só pode ficar
**em cima**"* de um `<canvas>` opaco, logo um fill esconderia a linha.

**A primeira metade é verdadeira; a conclusão não é.** `lightweight-charts` **5.2.1** — a versão
instalada nesta árvore — expõe `attachPrimitive()` **com `zOrder()`**, e o próprio `typings.d.ts`
documenta o valor que refuta a impossibilidade:

```
node_modules/lightweight-charts/dist/typings.d.ts:4885-4889
 * - `bottom`: Draw below everything except the background.
export type PrimitivePaneViewZOrder = "bottom" | "normal" | "top";
$ grep -c 'ISeriesPrimitive\|attachPrimitive\|IPanePrimitive' …/typings.d.ts  → 28
```

⇒ **um fill opaco DENTRO do canvas, por baixo da série, era possível.** A restrição real não é
*"o fill é impossível"* — é *"o fill é impossível **pelo caminho de overlay HTML que foi escolhido**"*.
São afirmações diferentes, e a segunda é a verdadeira.

**Ratifico assim mesmo, e a distinção é o ponto:** a decisão está **certa pelo argumento do §R4.2**
(o fill mede `1.19`, a região já é nomeada, `D-1` pedia fronteira), **não** por impossibilidade
técnica. Um "não dá" que na verdade é "não valia a pena" é dívida que ninguém reabre, porque ninguém
reabre o impossível. **Corrijo a frase, mantenho o resultado** (`R11`: erro não se apaga, se tarja).

**⇒ Ação, e é de uma linha, sem tocar pixel:** `T-04.10` §2.3 passa a ler *"o fill sai porque mede
`1.19` e a região já é nomeada; por overlay HTML ele seria impossível, e por
`attachPrimitive`/`zOrder:'bottom'` seria possível e não compensa"*. **Não apliquei** — `frontend/` e
o relatório do builder não são meus para editar nesta rodada; fica como item devolvido (§R4.5).

## R4.4 ⛔ O que `§R4` NÃO responde — e não deixo implícito

- **Se duas réguas + tag são lidas como UMA REGIÃO** por um operador — continua `[NÃO MEDIDO]`.
  **O falsificador do `D-1` permanece em pé, na redação que `§R3.5` já lhe deu:** *"ponha o operador
  diante da tela e peça que aponte o início das últimas 4 h; se ele precisar contar marcas de eixo,
  `D-1` vira must-fix"*. **Este `APPROVED` não o fecha** — ele aprova a forma **entregue**, não a
  cognição **não observada**. `[NÃO SEI]`, e é o mesmo `[NÃO SEI]` desde `§R2.6 Explore`.
- **Se a tag oclui a linha em outro estado de mercado** — a caixa é **opaca** e tem posição **fixa**
  (`left-2 top-1.5`). Hoje a série corre em `~1.53` e a tag está no topo, sem colisão
  `[MEDIDO nesta rodada, 1 instante]`. **Um instante não é uma medição de colisão** — não medi outros.
  Fora do escopo desta micro-rodada; registrado para não virar permanente por omissão.
- **Nada mais da tela foi rejulgado.** `D-2`, `D-3`, `d-4` e o `§R3.7` seguem como `§R3` os deixou.

## R4.5 Registro de execução da rodada 4

| item | estado |
|---|---|
| escrita | **somente** este arquivo, **somente** como `§R4`. As **1205** linhas de `R1`+`R2`+`R3` não foram tocadas |
| `frontend/` | **intocado** — a ablação foi `el.style.display` **no browser**; nenhum arquivo editado |
| servidor | `next start` em `127.0.0.1:4991`, **derrubado ao fim** (`ss -ltn` → `0` listeners em `:4991`) |
| `:3000` / `:8000` | **não tocadas** e **vivas** ao fim (`1` listener cada). `:3000` é PRODUÇÃO e não foi usada |
| commits | **nenhum** |
| `gate-record` | **NÃO gravado** — ato do owner |
| Figma | **nenhuma chamada** |
| Stitch | **nenhuma geração** — o artefato é código renderizado |
| Postgres | **não tocado**; nada semeado; API lida só por `GET` |
| devolvido | **1 item**: a correção da frase de `T-04.10` §2.3 (§R4.3), dono = quem for tocar aquele relatório |
