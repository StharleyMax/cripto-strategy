Veredito: APPROVED WITH CONDITIONS — score 7.3/10 — **julgamento de ESPECIFICAÇÃO, não de pixel: a tela da rodada 2 não existe.** Aprova as decisões de `Q-DG-1`, a codificação da liquidação e a recusa do numeral colorido de `SPEC-009` §7.3. **NÃO** torna `bc317e03` canônica: a canônica da S2 continua sendo `8174…` (Rev. B) até um render medido (condição C-0).

# Crítica de design — S2 Símbolo, Painel Multi-Série (7 panes) — rodada 2 (especificação)

- **Gate:** `ux-ui-mastery:design-critique` (Lerman + 10 dimensões), independente do `ui-designer`.
- **O que foi julgado:** a instrução [`stitch/instrucao-rodada2b-sobre-bc317e03.txt`](../handoff/stitch/instrucao-rodada2b-sobre-bc317e03.txt) (27 linhas; os números de linha abaixo são dela), [`DESIGN-LAYOUT.md`](../handoff/DESIGN-LAYOUT.md) §2 e §6, contra o meu relatório da r1 ([`DESIGN-LAYOUT-ux-critique-r1.md`](DESIGN-LAYOUT-ux-critique-r1.md)), `s9.txt` (normativo), `SPEC-009` §3, §4, §6.2–6.6, §7, §11 e [`DECISOES-DO-OWNER-2026-09-23.md`](../handoff/DECISOES-DO-OWNER-2026-09-23.md).
- **O que NÃO foi julgado, e por quê:** o pixel. A rodada 2 não materializou (`DESIGN-LAYOUT.md` §0). Toda afirmação de "fechado" abaixo quer dizer **"a instrução pede a coisa certa"**, e não "a tela a mostra". A condição da r1 (*"fechados e medidos no render, não declarados"*) **continua de pé** para a tela.
- **Estágio:** refinamento, rodada 2.

## Instrumentos (nenhum número sem o comando)

| medida | comando | resultado |
|---|---|---|
| contraste contra `#131722` | luminância relativa da WCAG, `python3 -c` sobre os hex | `#8b949e` **5.82** · `#089981` **5.01** · `#f23645` **4.59** · default da lib `#2B2B43` **1.30** · `#089981`×`#f23645` **1.09** `[MEDIDO, n=6 pares]` |
| opções de pane da lib | `grep -nE 'enableResize\|separatorColor\|separatorHoverColor' frontend/node_modules/lightweight-charts/dist/typings.d.ts` | existem as três (`:3228`, `:3234`, `:3240`); default `{enableResize: true, separatorColor: '#2B2B43', …}` (`:3161`) `[MEDIDO]` |
| regra D14 citada pelo designer | `grep -n 'D14' docs/product/STITCH_CONTEXT.md` | `:1101`: *"o numeral nunca é tingido por direção nem por integridade"* `[DOC]` |
| largura estimada dos selos a 12px | `len()` de cada string da instrução × 6.2 / 6.8 / 7.2 px por caractere | PREÇO 142 car. ≈ **880–1022px** · LIQUIDAÇÕES 144 ≈ **893–1037px** · OI 139 ≈ **862–1001px** · os outros ≤ 583px `[INFERRED: estimativa por largura média de glifo, não medida em render; disponível ≈ 1077px = 1166 − 8 de margem − ~65 da idade − 16 de folga]` |

---

## 1. Statements of Meaning — o que a especificação acerta e deve ser protegido

1. **A resposta à r1 é por predicado, não por remendo.** A idade virou propriedade da série (linha 12), a completude virou propriedade da janela única (linha 10), e o violeta voltou a ser só traço de losango (linha 25). São as três regras de `s9.txt` §4 e §10 aplicadas como regra, e não como correção de caso.
2. **A instrução termina com o próprio verificador** (linha 27): 8 carimbos, 1 QUARENTENA, nenhum texto abaixo de 12px, zero `rect` preenchido de verde. É a contagem que eu vou refazer no render, então ela torna a r3 falsificável.
3. **A decisão do owner sobre a liquidação resolveu o SF-2 de graça.** Com as barras vazada verde e cheia vermelha, a saliência delas passa a ser a das velas (5.01 e 4.59), e não mais 14.72. A recusa do designer ao SF-2 na r1 (`DESIGN-LAYOUT.md` §2) fica sem objeto, e está certa.
4. **`separatorHoverColor` igual a `separatorColor` com `enableResize=false`.** Hover que muda de cor sugere arrasto. Igualar os dois elimina uma afordância falsa (H4/H5). É um detalhe que a maioria dos designers deixaria passar.
5. **O §6 de `DESIGN-LAYOUT.md` escreve o falsificador de cada decisão** e aponta a limitação da lib (um só `separatorColor`) com arquivo e linha. É por isso que dá para julgar a especificação sem pixel.

## 2. Pergunta 1: a instrução 2b fecha MF-1..MF-10?

| MF | estado | linha da instrução | observação |
|---|---|---|---|
| **MF-1** idade por pane | **fechado**, com a condição C-4 | 12, 13–24, 27 | Oito carimbos, um por série, alinhados à direita do pane; `◇ idade ?` onde o atraso não foi medido (liquidações e OI). **Resta a Q-A da r1:** a instrução não diz qual modo o chrome mostra. `idade 42s` só é coerente em AO VIVO. Se o chrome da r1 ficar como está (AO VIVO em caixa, com a data de T ao lado), a idade fica incoerente com o modo |
| **MF-2** QUARENTENA | **fechado** | 15, 20 | A liquidação leva `◇ QUARENTENA`; o OI (agora Binance) não leva. `[NÃO SEI]` o estado de quarentena por série no ledger (`DESIGN-LAYOUT.md` §4 item 4): D8 lê o estado da feature, não da série |
| **MF-3** legenda do OI quebrada, chip sobre o texto | **fechado** (verificar no render) | 12 (`nowrap`), 19, 20 | Uma linha própria para o código vazado/cheio, em tinta fraca, sem chip. Estimativa ≈ 862–1001px contra ≈ 1077px disponíveis `[INFERRED]`: cabe, com pouca folga |
| **MF-4** numeral violeta | **fechado** | 20, 25 | `95/96 · 1 lacuna` em tinta neutra, sem caixa nem borda |
| **MF-5** ausência silenciosa | **PARCIAL** → N-1 | 10, 17 | Fecha no OI e no CVD delta (uma marca por bucket, e o único vão é o do OI com losango). **Abre na liquidação:** a linha 10 diz *"única ausência da tela: 1 bucket de OI"*, e as linhas 15 e 17 declaram `1364 ausentes` e desenham traço de ausência. A instrução se contradiz, e o gerador vai escolher um dos lados por conta própria |
| **MF-6** denominadores de janelas diferentes | **fechado** | 10, 13–24 | Todos os selos contam as mesmas 24h, cada um na grade nativa da série, que o selo nomeia (`15m`, `1m→15m`, `5m`, `8h`). Isso satisfaz a segunda saída que o MF-6 oferecia (*"declaração explícita de qual janela o denominador conta"*). `1440` é ilustrativo; o real é 1441 (`DESIGN-LAYOUT.md` D7) e é o que a implementação usa |
| **MF-7** selo do volume incompleto | **fechado** | 14 | Os quatro campos e a idade. O SF-5 (caixa alta) fecha junto |
| **MF-8** `±40k` | **fechado** | 5, 18 | `40000 / 0 / 40000`, sem sinal e sem `k`, no mesmo formato da legenda (`30258`). A condição C-3 trata da escala por trás desses rótulos |
| **MF-9** texto em 10–11px | **fechado** (verificar no render) | 12, 27 | 12px em toda a tela. A regra de estouro (tirar o símbolo repetido, nunca a fonte) está em `DESIGN-LAYOUT.md` §6 |
| **MF-10** fronteira invisível | **fechado** | 8 | `#8b949e`, 1px, largura inteira: **5.82:1** `[MEDIDO]`. Mais 8px livres no topo e na base do eixo. São as opções (a) e (b) do MF-10 juntas |

**Should-fix da r1:** SF-1 fechado (volume em ~13%, linha 14). SF-2 superado pela decisão do owner (§1 item 3). SF-3 fechado (palavra primeiro, sem ▲▼, linhas 15 e 18). SF-4 fechado ("entrada líquida", linha 19). SF-5 fechado.

**Resultado da pergunta 1:** 9 fechados e 1 parcial, **só na especificação**. Nada disto está medido.

## 3. Pergunta 2: `Q-DG-1` (`DESIGN-LAYOUT.md` §6)

| item | veredito | argumento |
|---|---|---|
| **camada sobreposta em `getHTMLElement()`**, e não trilho lateral | **CONCORDO** | (1) **Proximidade (Gestalt):** o valor sob o crosshair fica a centímetros da curva que ele descreve; o trilho obriga a um movimento de olho horizontal por pane, sete vezes por leitura. (2) **Consistência com o padrão que o usuário já conhece (H4, Lei de Jakob):** é a referência que o owner mandou. (3) **Custo de largura:** um trilho de ~200px tira ~17% do plot de *todos* os panes para servir texto. (4) **`s9.txt` §12:** a identidade fica no painel, sempre visível. A objeção clássica à sobreposição, que o texto cubra o dado, está resolvida em `DESIGN-LAYOUT.md` §6 pela reserva em `scaleMargins.top`. O falsificador (spike F-5) é o certo. **Condição C-5 abaixo** sobre `pointer-events: none` |
| **pesos 34 · 11 · 15 · 9 · 9 · 9 · 9** | **CONCORDO**, com o `[NÃO SEI]` da EX-3 mantido | A ordem acompanha o que cada marca precisa para ser lida: a vela de OI precisa de altura para mostrar a direção do corpo (15 > 11); a liquidação é evento esparso, lido por presença e altura (11); a linha lê tendência (9). Cálculo de sanidade `[INFERRED: altura de gráfico H ≈ 910px suposta]`: liquidação ≈ 104px − 20 de legenda − 8 de base ≈ 76px, ou seja ≈ 38px por perna, suficiente para barras esparsas. Pane de linha ≈ 85px − 28 ≈ **57px de dado**, abaixo do piso nominal de 72px, que conta o pane inteiro e não a área de dado. É exatamente a EX-3 |
| **`enableResize = false`** | **CONCORDO** | Redimensionar sem persistir é estado que some na remontagem (`ADR-043`) e fere H1 (o layout "esquece"). Persistir seria gerenciador de layout, **fora de escopo** (`s9.txt`, *"o conjunto de parâmetros É a URL"*). O custo em H3 (controle do usuário) é real e está nomeado no falsificador |
| **separador `#8b949e`, 1px, largura inteira** | **CONCORDO**, com a condição C-6 | É o único token neutro existente que passa 3:1 (**5.82**), e `#333846` (1.53) e `#222634` (1.19) não passam. Como a lib só tem **um** `separatorColor`, o separador dividido da instrução r2 (a anterior à 2b) não existia; a linha 8 da 2b já corrige isso. **Risco de hierarquia:** a 5.82:1, a linha é mais contrastada que os fills das velas (5.01/4.59). Uma linha de 1px pesa menos que um corpo preenchido, então aceito. O julgamento final fica para o render, e o falsificador do designer (*"o owner achar pesado"*) é o certo. **O default da lib, `#2B2B43`, dá 1.30:1** `[MEDIDO]`: esquecer o override regride o MF-10 em silêncio |

## 4. Pergunta 3: liquidação com short vazada verde para cima, long cheia vermelha para baixo, numeral neutro com quadrado. Defensável (EX-1)?

**SIM, e é a melhor saída disponível.** Argumento:

1. **A EX-1 pedia exatamente isto:** cor, se entrasse, entra como FILL de direção **com a forma de D3**, nunca sozinha. É o que a especificação faz.
2. **A objeção do designer na r1** (*"vazado já significa `close > open`"*) **não se sustenta aqui, e o motivo é estrutural:** na liquidação, a forma é **100% redundante com a posição**. Toda barra vazada fica acima do zero e toda barra cheia fica abaixo, então a forma nunca afirma nada que a posição não diga, e nunca pode contradizê-la.
3. **É a mesma gramática do pane de CVD delta:** delta > 0 é barra vazada acima do zero, delta < 0 é barra cheia abaixo. Com a convenção Coinalyze (short liquidado = compra forçada), **os dois panes de barra da tela dizem a mesma coisa:** "acima, vazado, verde = fluxo do lado comprador". O leitor aprende uma regra e lê dois panes.
4. **Invariantes mantidas:** zero `rect` preenchido de verde, e três canais que sobrevivem em escala de cinza (posição, forma, palavra). A razão de luminância entre os fills é 1.09 `[MEDIDO]`, então **a cor não carrega nada que o cinza perca**.
5. **Risco residual (EX-2 ampliada):** o convencional da TradingView *Markets* é o oposto (long verde para cima). A palavra "short liquidado" antes de cada numeral cobre isso. O falsificador é o owner ler a barra verde como "longs".

**O quadrado de 8px está certo em princípio** (é FILL, pode usar o hue; o número ao lado não usa). A condição C-7 trata do comportamento dele em forced-colors.

## 5. Pergunta 4: o conflito com `SPEC-009` §7.3. O designer está certo em recusar?

**SIM.** O texto do §7.3 (*"cada uma na cor da sua perna"*) colide com uma regra de hierarquia superior, que está escrita em três lugares: `STITCH_CONTEXT.md` D14 (`:1101`) `[DOC]`, `s9.txt` §1 (*"NÃO EXISTE cor de texto de direção"*) e o LEMBRETE 2. Detalhe honesto: no modo escuro, `#089981` (5.01) e `#f23645` (4.59) **passam** 4.5:1 como texto `[MEDIDO]`, então o argumento de contraste **não** é o que decide aqui. O que decide:

- (a) a razão de luminância entre os dois é **1.09**, então sob deuteranopia ou em cinza os dois numerais ficam **iguais**. A cor no texto não entrega nada que a palavra e o quadrado já não entreguem, e gasta a regra;
- (b) no modo claro, `#089981` dá 3.57:1 contra branco e **reprova** como texto (`s9.txt` §1);
- (c) a regra não tem exceção por pane, e abrir uma aqui é o precedente que o LEMBRETE 2 existe para impedir.

**A intenção do §7.3** (cada magnitude identificável à sua perna) **é atendida** pela palavra e pelo quadrado. **Encaminhamento:** o `/architect` emenda o §7.3 para *"cada magnitude precedida da marca (forma e cor) da sua perna; numeral em tinta neutra"*. O design não implementa o texto atual.

---

## 6. Pontuação (especificação)

| Dimensão | Nota | Observação principal |
|---|---|---|
| Clarity | 8 | Uma linha por pane, palavra antes do numeral, eixo sem sinal; a contradição da ausência na liquidação (N-1) é o que falta |
| Consistency | 8 | A mesma gramática nos dois panes de barra; selos com a mesma anatomia; o §7.3 foi recusado a favor da regra superior |
| Hierarchy | 7 | SF-1 e SF-2 resolvidos; separador a 5.82 é mais claro que os fills (a julgar no render) |
| Efficiency | 8 | Tudo numa vista, crosshair único, sem resize e sem estado escondido |
| Accessibility | 7 | 12px, três canais em cinza, separador ≥3:1; forced-colors do quadrado ainda não especificado (C-7) |
| Emotional Design | 7 | Sóbria e analítica; selos de ~140 caracteres em três panes deixam o topo denso |
| Error Resilience | 7 | Idade, QUARENTENA e completude corretas; abertos N-1 (ausência na liquidação) e N-2 (procedência do OI) |
| Cognitive Load | 6 | 7 panes × selo de 4 campos; três selos perto do limite da largura |
| Innovation | 8 | Forma redundante com posição na liquidação; idade por série com `◇ idade ?` no canal de integridade |
| Polish | **[NÃO SEI]** | Não há pixel. Não pontuo acabamento de uma tela que não existe |

**Média: 7.3/10** `[MEDIDO: (8+8+7+8+7+7+7+6+8)/9 = 66/9 = 7.33; Polish excluído por não ser julgável sem render]`

## 7. Achados novos da especificação

### Must-fix (texto da instrução, antes de reemitir)

**N-1 — A ausência na liquidação está contraditória, e não tem resolução definida para o bucket desenhado.** São três defeitos:

- (a) a linha 10 (*"única ausência: 1 bucket de OI"*) contradiz as linhas 15 e 17 (`1364 ausentes`, traço de ausência);
- (b) a linha 17 fala de *"minuto sem ponto"*, mas o pane desenha **buckets de 15m**. Um minuto vale ≈ 0.81px `[INFERRED: 1166/1440]`, então não há como desenhar ausência por minuto;
- (c) `SPEC-009` §7.3 manda *"cada perna mantém o PRÓPRIO par ausência/zero do seu lado do zero"*, e a instrução põe um só traço "rente à base".

**Correção:** definir o estado **por bucket de 15m e por perna**: barra (soma > 0) · traço de zero `#e6e9ef` (minutos observados, todos zero) · traço de ausência `#8b949e` (nenhum minuto observado). Cada traço fica **do lado da sua perna**. Reescrever a linha 10 como *"únicas ausências: 1 bucket de OI e os buckets de liquidação sem minuto observado"*. **O bucket misto** (alguns minutos ausentes, outros com valor) é semântica de dado: `[NÃO SEI]` como marcar; dono: `quant-architect`. No mock, basta não desenhar nenhum.

**N-2 — O candle de OI está rotulado `OBSERVADO` (linha 19), mas é uma projeção.** `ADR-045` o chama de *"candle de OI derivado"* (título) e `SPEC-009` §6.2–6.4 o constrói na rota a partir de amostras pontuais (`derived_from`, `samples`). O open e o close são pontos observados, mas o **high e o low são o máximo e o mínimo de amostras discretas**, ou seja, um limite inferior da amplitude real, e não a amplitude observada. `s9.txt` §10: DERIVADO mostra a expressão. **Correção:** `DERIVADO (OHLC de amostras 1m · ADR-045)`, a menos que o `quant-architect` sustente `OBSERVADO` por escrito. `[INFERRED: a ADR-045 não usa o vocabulário de procedência do s9 §10; o rótulo é leitura minha]`. Pela mesma régua, **a liquidação `1m→15m` pode continuar `OBSERVADO`:** a soma preserva exatamente a medida do fornecedor, enquanto o máximo de amostras aproxima.

### Should-fix / condições de implementação

- **C-3 — As duas escalas da liquidação têm de ser simétricas.** `SPEC-009` §7.2 usa duas escalas sobrepostas (a de baixo com `invertScale`). Se cada uma fizer autoscale sozinha, 5000 USD de long pode ocupar o pane inteiro enquanto 5000 USD de short mal aparece. **O eixo `40000 / 0 / 40000` então mentiria para uma das pernas.** Requisito: as duas escalas compartilham o mesmo máximo (o maior das duas pernas). `[NÃO SEI]` se a lib rotula as duas escalas do mesmo lado; é pergunta para o spike (`ADR-044/F-6`) e para `Q-DG-2` (log × linear).
- **C-4 — Modo explícito no chrome.** Resolver a Q-A da r1 na instrução: se o modo é AO VIVO, a data de T some do chrome; se é COMO EM T, as idades contam contra T e o chip de AO VIVO não fica ativo.
- **C-5 — `pointer-events: none` na camada** não pode engolir filho interativo. `[NÃO SEI]` se algum badge (`BeyondCoverageBadge`, `AbsenceNote`) é link ou foco hoje. Se for, esse filho recebe `pointer-events: auto` e continua alcançável por teclado.
- **C-6 — `separatorColor` explícito e testado.** O default da lib dá 1.30:1 `[MEDIDO]`. Uma asserção do `frontend-qa` sobre as opções do chart impede a regressão silenciosa do MF-10. A escala de volume também precisa de margem inferior ≥ 4px: o doji de volume é `#8b949e`, a mesma cor do separador, e encostado nele se funde.
- **C-7 — O quadrado de 8px em forced-colors.** O HTML da camada é CSS, e o sistema sobrescreve as cores dele (`s9.txt` §15). O quadrado cheio desenhado só com `background` pode sumir. Implementar o quadrado de modo que a diferença vazado × cheio seja **estrutural** (borda nos dois, preenchimento só no cheio) ou com `forced-color-adjust: none`, como marca de dado. `[NÃO SEI]` o valor exato que cada user agent força em `fill`/`background`.
- **C-8 — Coluna fixa para os numerais da legenda.** Em `short liquidado 30258 · long liquidado 0`, o segundo numeral anda quando o primeiro muda de largura sob o crosshair. `s9.txt` §13 chama isso de defeito. Slot de largura fixa em `ch`, alinhado à direita, para cada valor que muda.

### Could-improve

- **CI-4 — O selo do volume fica no topo do pane de preço, a ~250px das barras dele.** Isso fere a proximidade, mas é a convenção da referência. Aceitável; reavaliar no render.
- **CI-2 da r1 continua aberto:** `BTCUSDT perp` no OI é o primeiro candidato a sair se o selo estourar.

### Explore

- **EX-3 (mantido):** pane de linha com ≈ 57px de dado `[INFERRED]`; medir com dado real.
- **EX-4 — `Q-DG-3`:** o mock mostra 24h de um regime só. A marca de fronteira entre o histórico derivado (5m) e o polling (1m), e se `95/96` conta candles ou amostras (`samples.expected = 15`), é `[NÃO SEI]`. Dono: `design_gate` + `quant-architect`.
- **EX-5 — Bucket em formação (`SPEC-009` §4):** o mock não o mostra. Default aceito: a legenda sem crosshair mostra o último bucket fechado.
- **Documentação:** `DESIGN-LAYOUT.md` §0 fala em **3** chamadas e aponta para `instrucao-rodada2…`; o brief fala em **4** e na 2b. `[NÃO SEI]` qual está certo; o `ui-designer` alinha o §0.

## 8. Condições, em ordem

- **C-1 e C-2 (N-1 e N-2):** corrigir o texto da instrução **antes de reemitir**. Esforço baixo.
- **C-3 a C-8:** entram no handoff do `frontend-architect`/`frontend-builder`. C-3 e C-6 viram asserção de teste.
- **C-0:** a tela só vira canônica depois de um render **medido** na r3, com as contagens da linha 27 por atributo SVG (a E6 do `verify_screen.py` contando por pane, como o designer propôs), a medição por metade de eixo da r1, o contraste e a fonte por `grep`.
- **O que este veredito libera já:** as decisões de `Q-DG-1` (camada sobreposta, pesos, `enableResize=false`, separador `#8b949e`), a codificação da liquidação e a recusa do §7.3 **valem** para a SPEC e para o spike.
