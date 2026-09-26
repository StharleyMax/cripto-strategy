Veredito: NEEDS_FIX — score 5.9/10

# Crítica de design — S2 Símbolo, Painel Multi-Série (7 panes) — rodada 1

- **Gate:** `ux-ui-mastery:design-critique` (Lerman + 10 dimensões), independente do `ui-designer`.
- **Artefato:** tela Stitch `bc317e03a98c4d5998a7eae94c695a34`, render 1280x1024 (`revC.png` / `revC.html`, scratchpad da sessão `e5b6e66d`).
- **Comparado com:** a referência do owner `handoff/referencia/coinalyze-tradingview-2026-09-23.png`, a Rev. B aprovada (`revB.png`, 4 panes), as regras travadas `s9.txt` (normativo) e `frontend/src/charts/color-tokens.ts`.
- **Estágio:** refinamento (a primeira tela de 7 panes).

## Instrumentos desta crítica (nenhum número sem o comando)

| medida | comando | resultado |
|---|---|---|
| contraste contra `#131722` | fórmula de luminância relativa da WCAG em `python3 -c` sobre os hex | `#089981` **5.01** · `#f23645` **4.59** · `#8b949e` **5.82** · `#e6e9ef` **14.72** · `#e0aaff` **9.68** · `#222634` **1.19** · `#333846` **1.53** `[MEDIDO]` |
| marcas por pane e por metade do eixo (x<583 / x≥583, viewBox de 1166) | regex `python3` sobre os `<svg viewbox="0 0 1166 N">` de `revC.html`, contando `<rect x=…>` | preço+volume **134** (66/68) · liquidações **9** · OI **46 (31/15)** · CVD delta **48 (31/17)** `[MEDIDO]` |
| tamanhos de fonte | `grep -oE 'text-\[[0-9.]+px\]' revC.html \| sort \| uniq -c` | **10px ×9 · 11px ×15** · 12px ×2 · 13px ×2 `[MEDIDO]` |
| tinta violeta em texto | `grep -oE '(text\|stroke\|fill)-\[#…\]' revC.html` | `text-[#e0aaff]` **×1**, no chip "1 lacuna", **10px** `[MEDIDO]` |
| tinta `#222634` em texto | idem | **×7**, todas em separadores `·`/`\|` (decorativo, isento de 1.4.3) `[MEDIDO]` |

A contagem por atributo SVG do designer (136 vazados / 86 cheios / 9 liquidação / 6 doji / 0 verde preenchido, soma 237) bate com `grep -c '<rect' revC.html` = **237** `[MEDIDO]`. Confirmo o diagnóstico de que `scripts/verify_screen.py` não lê SVG `[INFERRED: aceito do designer, não reexecutei o script]`.

---

## 1. Statements of Meaning — o que funciona e deve ser protegido

1. **A estrutura é a da referência.** Um gráfico, panes empilhados, um eixo de tempo no rodapé, crosshair vertical atravessando os 7 panes, legenda no canto superior esquerdo. É literalmente o que o owner pediu (*"manter essa forma de separação bem próxima da coinalyze e tradingview"*, DISCOVERY §1) e cabe em 1024px **sem rolagem**, que era o defeito (l) de `s9.txt`. Proteger.
2. **A redundância de forma se generalizou pelo predicado, não pela palavra.** Vela de preço, barra de volume, vela de OI e barra de CVD delta usam o mesmo código vazado/cheio/cruz, e **0 rect preenchido de verde** `[MEDIDO]`. Em escala de cinza a tela inteira continua legível na direção — SC 1.4.1 atendido nas marcas de direção. Os fills passam 3:1 contra o plot (5.01 e 4.59) `[MEDIDO]`, então SC 1.4.11 também.
3. **O zero legítimo das liquidações é uma marca.** Os traços curtos na linha de base do pane de liquidações distinguem "não houve liquidação" de "não sabemos" — a decisão travada de `s9.txt` (§ Decisões de UX) foi respeitada sem ser pedida no brief. Proteger.
4. **O candle de OI entrega a leitura que o owner descreveu.** *"o preço pode estar caindo, porém se tá entrando OI, quer dizer que tem intenção na queda"* (DISCOVERY §1) vira uma comparação vertical pré-atentiva: vela cheia de preço sobre vela vazada de OI no mesmo x. A legenda explica o código em palavra ("vazado = entraram contratos · cheio = saíram contratos").
5. **O orçamento de hue foi respeitado.** As linhas (L/S, funding, CVD acumulado) estão em tinta neutra em vez do teal/verde/laranja da referência; o texto não tem direção tingida; a procedência é palavra em tinta forte (OBSERVADO/DERIVADO), não chip colorido. Os três hues continuam sendo três.

## 2. Perguntas do designer — veredito por decisão

| | veredito | argumento |
|---|---|---|
| **D1** 1 gráfico, 7 panes, separador 1px `#222634`, 1 eixo, crosshair compartilhado | **ACEITO, com condição (MF-10)** | A estrutura é a da referência e é o motivo da tela existir. **O separador, não:** `#222634` mede **1.19:1** contra o plot `[MEDIDO]`. A Rev. B separava os panes por uma **faixa de cabeçalho** em `#0d1017`; a Rev. C removeu a faixa (a legenda passou a sobrepor o plot) e ficou só com uma linha quase invisível. Resultado visível: na coluna do eixo, o `-40k` das liquidações (y≈475) e o `27800.00` do OI (y≈501) ficam a ~26px um do outro sem fronteira perceptível — com 7 escalas y independentes, o leitor pode atribuir um rótulo ao pane errado. |
| **D2** legenda em 1 linha, valor sob o crosshair; idade uma vez por tela | **PARCIAL — "idade uma vez por tela" DERRUBADO** | Legenda em 1 linha com valor sob o crosshair: aceito (é a referência). Idade única por tela: **não**. `s9.txt` §12 diz *"o número carrega apenas a idade"* e §10 define idade = tempo de referência − `available_at` **da série**. Funding (8h), OI (5m Coinalyze), liquidações e klines têm `available_at` diferentes; uma idade única é **falsa para pelo menos 6 dos 7 panes**. A Rev. B já fazia do jeito certo: `idade 30h18m` na borda direita **do pane**. |
| **D3** volume no rodapé do preço, forma da vela | **ACEITO** | É a referência e é o mesmo predicado da vela acima (o volume *é* do candle), então a forma não afirma nada novo. Ressalvas em SF-1 (altura da faixa) e CI-1 (escala). |
| **D4** OI em vela, mesmo predicado | **ACEITO** | O predicado close>open vale para qualquer série OHLC; `s9.txt` §2 diz que *"a forma codifica o PREDICADO, não a palavra 'alta'"*. O custo — verde significa "preço subiu" num pane e "OI subiu" no vizinho — é o da referência, e é justamente o que torna a divergência pré-atentiva. Falsificador em EX-2. Ajuste de texto em SF-4 ("entrada **líquida**"). |
| **D5** liquidações num pane, short ↑ / long ↓, as duas em `#e6e9ef` | **ACEITO COMO PROVISÓRIO** | A direção tem suporte na própria referência: as barras verdes para cima coincidem com o rali em x≈530, e as vermelhas para baixo com a queda em x≈1060 — short liquida na alta, long na queda `[INFERRED: co-movimento lido na imagem da referência; NÃO é a fonte lida que DISCOVERY §3 Q3 exige]`. Tinta neutra nas duas é defensável: a coorte é lida por **posição** (acima/abaixo do zero) + palavra, então não há violação de 1.4.1 e não se antecipa Q3. Ressalvas: saliência (SF-2) e glifo ▲/▼ (SF-3). |
| **D6** funding em degrau, L/S e CVD acumulado em linha 1px, CVD delta vazado/cheio | **ACEITO** | Degrau é honesto para um dado de 8h (não interpola entre fechos). CVD delta como barra de sinal com forma é consistente com D3/D4. |

**F1–F4 do designer: os quatro CONFIRMADOS.** F1 é reescrito por MF-1 (idade por pane, não por tela). F2 é ampliado por MF-2. F3 é MF-3. F4 é MF-8.

## 3. Perguntas neutras (Lerman passo 3)

- **Q-A.** No chrome, `AO VIVO` aparece em caixa e `COMO EM T (2023-10-26T14:30:00Z)` aparece ao lado, sem caixa. Qual é o modo ativo? Se for AO VIVO, por que a data de T está visível; se for COMO EM T, por que a caixa está em AO VIVO? A idade (MF-1) depende da resposta: em COMO EM T o tempo de referência é T. `[NÃO SEI]` o que o designer pretendeu.
- **Q-B.** Os valores da legenda e os crachás do eixo direito são o valor **sob o crosshair** (08:45) — por exemplo o crachá `2.096` do L/S está na altura do ponto do crosshair, não da borda direita. Com o crosshair fora do gráfico, a legenda mostra o último valor? É esse o valor que leva idade?
- **Q-C.** Qual janela a tela mostra? O eixo vai de ~03:00 a ~23:00 e o pane de preço tem **67 velas** `[MEDIDO: 134 rects / 2]` — ~17h de 15m — mas os selos dizem 384 (preço, CVD), 96 (liquidações), 288 (OI, L/S) e 3 (funding). Ver MF-6.
- **Q-D.** O volume usa o eixo de preço (os rótulos `64500.00`/`64000.00` ficam ao lado das barras de volume). Isso foi intencional, como overlay de TradingView?

## 4. Pontuação

| Dimensão | Nota | Observação principal |
|---|---|---|
| Clarity | 6 | Estrutura imediatamente reconhecível para quem conhece TradingView; a legenda do OI quebrada e a fronteira invisível entre panes custam leitura. |
| Consistency | 7 | Fiel à referência e ao código de forma; a violação é interna — chip violeta de completude, selo do volume diferente dos outros. |
| Hierarchy | 5 | As barras de liquidação em `#e6e9ef` (14.72:1) são a marca mais saliente da tela, acima das velas (5.01/4.59); a faixa de volume toma ~23% do pane de preço. |
| Efficiency | 7 | Tudo numa vista, sem rolagem, crosshair único: a comparação vertical custa zero cliques. |
| Accessibility | 5 | Forma de direção e contraste de fill passam; 24 textos em 10–11px contra o piso de 12–13px de `s9.txt` §14; separador a 1.19:1. |
| Emotional Design | 7 | Sóbria, analítica, sem ruído de corretora — atende "densidade analítica, não de marketing". |
| Error Resilience | 4 | Ausência silenciosa na metade direita do OI e do CVD delta sob selos que afirmam completude; idade e quarentena ausentes. É a dimensão que o produto existe para defender. |
| Cognitive Load | 5 | 7 panes está no limite, mas é o pedido do owner e a referência tem 6; o custo real vem de denominadores que não se somam e de 7 escalas sem fronteira. |
| Innovation | 8 | Estender vazado/cheio/cruz a volume, OI e CVD delta, e marcar o zero legítimo, resolve em forma o que a referência resolve só em cor. |
| Polish | 5 | Sobreposição do chip, quebra de linha, sinal em magnitude, `Volume` em caixa mista contra rótulos em caixa alta. |

**Média: 5.9/10** `[MEDIDO: (6+7+5+7+5+7+4+5+8+5)/10 = 59/10]`

## 5. Achados

### Must-fix

**MF-1 — Idade ausente, e a correção tem de ser por pane, não por tela.** (F1 confirmado; D2 parcialmente derrubado.) Zero carimbos de idade na tela; o selo sai com 3 de 4 campos — o defeito (d) de `s9.txt` §16, já cometido antes nesta tela. **Correção:** uma idade por série, na borda direita do pane, como na Rev. B (`idade 30h18m`), calculada contra T em COMO EM T. Onde o atraso do endpoint não foi medido (candidato: Coinalyze — `[NÃO SEI]` se está medido), **não** mostrar idade e levar a afirmação ao canal de integridade (losango + "idade ?"), `s9.txt` §10.

**MF-2 — QUARENTENA ausente, e não só no OI.** (F2 confirmado e ampliado.) A Rev. B marcava o OI com `◇ QUARENTENA`. Na Rev. C o OI **e** as liquidações vêm de `coinalyze`, e a feature `coinalyze-fora-da-quarentena` ainda não fechou `[INFERRED: pelo nome e por DISCOVERY §linha 4; NÃO SEI o estado atual de cada série no ledger]`. **Correção:** toda série cujo estado seja quarentena leva losango vazado + palavra QUARENTENA no selo. Confirmar o estado por série antes de desenhar, e não por analogia com a Rev. B.

**MF-3 — A legenda do OI quebra em 2 linhas e o chip "1 lacuna" sobrepõe o texto.** (F3 confirmado.) "OPEN INTEREST", "OHLC 5m→15m" e "(USD mi)" quebram cada um; o chip cobre "vazado = entraram contratos". **Correção:** uma linha, como os outros 6 panes; se não couber em 1166px, a explicação do código vazado/cheio pode ir para uma segunda linha **própria**, em tinta fraca, nunca sob um chip. Critério verificável: nenhum bounding box de texto do selo intersecta outro.

**MF-4 — O numeral de completude "1 lacuna" está em violeta, em 10px.** `text-[#e0aaff]` + `border-[#e0aaff]` no chip `[MEDIDO]`. `s9.txt` §4: *"violeta apenas no TRAÇO do losango e na régua vertical do selo"* e *"integridade nunca tinge numeral"*; §16(c): completude incompleta *"não tem cor. Tinta neutra."* A Rev. B fazia certo: `1149/1152 · 1 lacuna` em tinta neutra, e o violeta só no losango de QUARENTENA. **Correção:** `285/288 · 1 lacuna` em tinta neutra; o violeta fica no traço do losango desenhado no plot (x≈280, que já existe e está correto).

**MF-5 — Ausência silenciosa na metade direita do OI e do CVD delta.** OI tem **31 marcas à esquerda e 15 à direita**; CVD delta **31 e 17**; o preço, no mesmo eixo, **66 e 68** `[MEDIDO]`. Na imagem, depois de ~12:00 as velas de OI e as barras de CVD aparecem uma a cada ~3 buckets, **sem travessão, sem losango** — e os selos afirmam `285/288 · 1 lacuna` e `384/384`. Isto é o que `s9.txt` proíbe em *"ausência de dado nunca é interpolada em silêncio. Série de fluxo ausente mostra um travessão"*, e o selo contradiz o plot. **Correção:** ou uma marca por bucket (o dado é completo), ou o buraco marcado (travessão no CVD, losango no OI) e o denominador que bate com o que está desenhado. `[NÃO SEI]` se é artefato do gerador ou intenção; o efeito na tela é o mesmo, e o mock vira especificação.

**MF-6 — Os denominadores de completude não descrevem a mesma janela.** No mesmo eixo de tempo: preço `384/384` (15m ⇒ 96h), CVD delta `384/384` (15m ⇒ 96h), liquidações `96/96` (15m ⇒ 24h), OI `285/288` (5m ⇒ 24h), L/S `288/288` (5m ⇒ 24h), funding `3/3` (8h ⇒ 24h); o plot mostra **67 velas** (~17h) `[MEDIDO: texto dos selos; 134 rects no SVG do preço, metade velas]`. Quatro panes dizem 24h, dois dizem 96h, e o desenho diz ~17h. Com um só eixo, completude é comparável entre panes **só** se o universo for o mesmo. **Correção:** todos os selos com o denominador da janela carregada (a mesma), e a janela visível coerente com ela, ou uma declaração explícita de qual janela o denominador conta.

**MF-7 — O selo do volume está incompleto.** `Volume · 1m→15m · BTC · 812.44` — faltam **procedência** (OBSERVADO/DERIVADO) e **completude**, e a idade (MF-1). O volume é numeral de mercado e cai em `s9.txt` §10: *"nenhum numeral de mercado aparece sem um selo de quatro campos"*. Se o volume vier a ser split buy/sell (DISCOVERY §3 Q2), a procedência vira DERIVADO com a expressão — o selo precisa do campo desde já.

**MF-8 — O eixo das liquidações usa `+40k` / `-40k`.** (F4 confirmado.) As duas metades são **magnitude** (USD liquidado, sempre ≥ 0); o `-` afirma um sinal que o dado não tem, e contraria `s9.txt` §8, em que o sinal é um canal de leitura de delta. E a legenda escreve `30258` enquanto o eixo escreve `40k`: dois formatos para a mesma unidade no mesmo pane (`s9.txt` §11). **Correção:** magnitudes sem sinal nas duas metades (`40000` acima e abaixo), e a coorte dita pela palavra na borda do pane, não pelo sinal.

**MF-9 — O texto do selo está abaixo do piso de tamanho travado.** **24** ocorrências em 10–11px `[MEDIDO]`, incluindo as legendas dos panes e o chip; `s9.txt` §14 fixa *"texto secundário 12-13px"*. Em 7 panes de uma sessão longa, o selo é a informação que o produto existe para mostrar, não um detalhe. **Correção:** selo em ≥12px. Se não couber numa linha em 12px, o que sai é redundância (ver CI-2), não o tamanho.

**MF-10 — A fronteira entre panes não é perceptível.** O separador `#222634` mede **1.19:1** contra o plot `[MEDIDO]`; mesmo `#333846` daria **1.53:1** `[MEDIDO]`. Com 7 escalas y independentes lado a lado na coluna do eixo, a fronteira é necessária para saber a que pane pertence um rótulo — é por isso que invoco o SC 1.4.11 (≥3:1 para objeto gráfico necessário ao entendimento) `[INFERRED: juízo de que o separador é "necessário"; a Rev. B não dependia dele porque tinha a faixa de cabeçalho]`. **Correção (o designer escolhe):** (a) separador ≥3:1 **pelo menos na coluna do eixo**, ou (b) uma folga vertical entre o último rótulo de um pane e o primeiro do seguinte que torne a atribuição inequívoca, medida no render. Não crie uma quarta superfície (`s9.txt` §9).

### Should-fix

**SF-1 — A faixa de volume toma ~23% da altura do pane de preço** (y≈300–377 de 40–377, lido no PNG `[MEDIDO: pixel no render]`); na referência ela ocupa ~12%. Barras de volume quase tão altas quanto o range das velas competem com a série principal (hierarquia) e roubam resolução vertical das velas. Alvo: ~12–15%.

**SF-2 — As liquidações são a marca mais saliente da tela.** `#e6e9ef` sólido mede **14.72:1**, contra 5.01/4.59 das velas `[MEDIDO]`. Evento raro deve saltar aos olhos (pop-out), mas não mais do que o preço. Opção sem gastar hue: barra vazada com contorno `#e6e9ef`, ou fill em `#8b949e` (5.82:1, passa 3:1). Registrar a escolha como provisória até Q3.

**SF-3 — ▲/▼ na legenda das liquidações se lê como "alta/baixa".** Em trading, `▲ short 30258` tende a ser lido como "short subiu". O triângulo também é a forma que `s9.txt` §4 reserva à severidade de dashboard (motivo para mantê-lo longe do canal de integridade, não uma proibição aqui). **Correção:** palavra primeiro — `short liquidado (acima) 30258 · long liquidado (abaixo) 0` — ou rótulos fixos na borda direita, como "short ↑ / long ↓" no eixo.

**SF-4 — "entraram contratos" deve ser "entrada líquida".** Vela vazada de OI significa que o OI **líquido** subiu no bucket; contratos também saíram. A palavra certa evita que se leia fluxo bruto num dado de estoque.

**SF-5 — "Volume" em caixa mista, contra os outros 7 rótulos em caixa alta**, e sem o `·` de separação no mesmo peso: o selo do volume parece de outra família. Alinhar ao padrão dos outros selos.

### Could-improve

**CI-1 — O volume usa o eixo de preço.** `64500.00`/`64000.00` ficam ao lado das barras de volume e sugerem que a barra está em preço. A referência faz o mesmo (convenção de overlay de TradingView), então é aceitável; o volume poderia mostrar só o valor sob o crosshair, na legenda, sem rótulo de eixo concorrente.

**CI-2 — O selo do preço repete o que o chrome já diz.** `BTCUSDT` aparece no chrome e em 5 selos. `s9.txt` §12 permite: sessão carrega o contexto uma vez por tela. Se MF-9 apertar o espaço, o símbolo é o primeiro que sai do selo (fica o ativo `BTC` quando a série é da moeda).

**CI-3 — Três linhas neutras idênticas** (L/S, funding, CVD acumulado) diferem só pelo rótulo. Aceitável pelo orçamento de hue, mas o funding em degrau poderia ter traço de 1.5px para se destacar da linha de base próxima.

### Explore

**EX-1 — Q3 (cor das liquidações) tem dono, o `quant-architect`.** Se a fonte lida confirmar a convenção da Coinalyze e o owner quiser cor, ela entra como FILL de direção **com a forma de D3** (vazado/cheio), nunca como cor sozinha.

**EX-2 — Falsificador de D4:** se, em uso real, o owner ler a vela vazada de OI como "preço subiu" (confundir os panes pela cor), o código compartilhado falhou e o OI precisa de uma marca distinta. Pergunta de uma linha ao owner depois da primeira sessão.

**EX-3 — Carga de 7 panes em 1024px:** os panes de linha (L/S, funding) têm ~80px. `[NÃO SEI]` se isso basta para ler mudança de regime do funding sem zoom. Medir quando houver dado real, não no mock.

## 6. Próximos passos (em ordem)

1. **MF-5, MF-6** — honestidade do dado desenhado. Esforço baixo no mock, impacto máximo: é o que o produto existe para impedir.
2. **MF-1, MF-2, MF-4, MF-7** — selo de 4 campos e canal de integridade corretos. Esforço baixo; a Rev. B já tem o padrão certo para copiar.
3. **MF-3, MF-8, MF-9** — legibilidade do selo em 12px, uma linha. Esforço médio (pode exigir CI-2).
4. **MF-10** — fronteira entre panes. Esforço baixo, verificação por medida no render.
5. **SF-1…SF-5** na mesma rodada, se couberem; a rodada 2 volta a este gate com a mesma contagem por SVG.

**Condição para APPROVED na rodada 2:** MF-1 a MF-10 fechados **e medidos no render** (contagem de marcas por metade, contraste, fonte por grep) — não declarados.
