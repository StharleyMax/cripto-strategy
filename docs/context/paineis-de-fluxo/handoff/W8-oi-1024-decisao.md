# W8 — decisão de design para o `B-1` (área de dado do OI a 1024×768)

- Autor: `ui-designer`, com autonomia delegada (`CLAUDE.md`, "Design — autonomia delegada"). **Esta decisão
  só vale depois do veredito do `ux-ui-mastery`**, que roda depois e em separado.
- Origem: `gates/W8-DESIGN-REVIEW.md` §B-1. Condição do gate: a 1024×768, nos 5 TFs, a área de dado do OI
  fica ≥ a do master (72 px em 1m/5m/15m, 59 px em 1h/4h). Tirar o TF do cabeçalho não conta.
- Alvo medido: `wave/paineis-f06 @ a67de6d`. Nenhum arquivo de `frontend/` mudou entre `a67de6d` e a HEAD
  desta decisão (`git diff --stat a67de6d HEAD -- frontend` vazio). Referência: `master @ d2055d9`.

## 1. A decisão

**Os quatro campos O·H·L·C da legenda do OI passam a formar um grupo que não quebra (`nowrap`). Só o
rótulo `DERIVADO (…)` continua podendo descer para a 2ª linha.** O cabeçalho N-2 fica como foi aprovado
(`gates/T-05.6-DESIGN-GATE.md` (b)). Os ~22 px (~30 px em 15m) que ele acrescenta saem do **fim da
linha**, ou seja, da cauda da procedência `Grandeza · Universo · Coorte`. Esse item já é o último filho,
o único que trunca com `…`.

### 1.1 A causa, medida (não é a que a revisão estimou)

A linha da legenda (`PaneLegendLine`) é `flex-nowrap`, mas o `OiCandleLegend` no meio dela é um item
`inline-flex flex-wrap` que **encolhe**. Encolher é o comportamento padrão de flex. O mínimo dele é o
`min-content` de um contêiner que quebra, e esse mínimo é o **maior campo sozinho**, não a fileira
O·H·L·C. O motor de flex divide o transbordo da linha entre a legenda e a procedência, em proporção à
largura de cada uma. Quando a legenda fica mais estreita que a fileira, o `C` desce de linha.

| ref, 1024×768 | largura da legenda | fileira O·H·L·C | folga |
|---|---|---|---|
| master, 1m | 434,5 | 429,0 | **+5,5** |
| master, 5m/15m | 430,9 | 429,0 | **+1,9** |
| master, 1h/4h | 429,8 | 429,0 | **+0,8** |
| wave, 1m/5m/15m | 421,3 / 417,8 / 413,4 | 429,0 | **−7,7 / −11,2 / −15,6** ⇒ `C` quebra |
| wave, 1h/4h | 416,6 | 429,0 | **−12,4** ⇒ `C` quebra |

`[MEDIDO 2026-10-03, proto-w8-oi.mjs (abaixo), n = 10 cargas: 2 refs × 5 TFs]`

> ⚠️ **Correção ao `W8-DESIGN-REVIEW.md` §B-1, que fica escrito em vez de apagado.** A revisão leu
> *"cerca de 12 px de folga"* no master (`C` em x = 621, `Grandeza…` em 634). Esses 12 px são o `gap-x-3`
> da linha, e não folga. A folga real era de **0,8 a 5,5 px**. A conclusão da revisão sobrevive, e piora:
> o master já estava a menos de 1 px de quebrar em 1h/4h. O `[NÃO SEI]` da revisão sobre a fragilidade
> do master estava certo. Bastaria um dígito a mais no OI para o master quebrar sozinho.

A correção ataca a causa, e não o sintoma: com o grupo `nowrap`, o `min-content` da legenda passa a ser a
fileira inteira. A fileira não quebra mais por conta da divisão proporcional, com qualquer número de
dígitos, enquanto a linha tiver espaço para `cabeçalho + 12 + fileira + 12` (ver §3).

### 1.2 Os px, medidos num protótipo no DOM real (não estimados)

Protótipo: o build da wave (`a67de6d`), com uma regra CSS que emula o grupo `nowrap`:
`[data-legend-ohlc="oi"]{min-width:429.5px}`. Ela foi injetada na resposta do `.css` por `page.route`,
antes da hidratação e antes do latch da reserva de rótulo do `T-03.12`. 0 erro de hidratação.

**Área de dado do OI** (`data-pane-height-px − data-reserved-scale-top-px`):

| 1024×768 | master | wave hoje | **wave + decisão** | gate | 1º bloco da legenda | reserva `T-03.12` |
|---|---|---|---|---|---|---|
| 1m | 72,0 | 59,2 | **72,0** | ≥ 72 ✓ | 32 px (era 48) | não |
| 5m | 72,0 | 59,2 | **72,0** | ≥ 72 ✓ | 32 px | não |
| 15m | 72,0 | 59,2 | **72,0** | ≥ 72 ✓ | 32 px | não |
| 1h | 59,2 | 32,0 | **59,2** | ≥ 59 ✓ | 32 px | **não** (era sim) |
| 4h | 59,2 | 32,0 | **59,2** | ≥ 59 ✓ | 32 px | **não** (era sim) |

`[MEDIDO 2026-10-03, proto-w8-oi.mjs, n = 15 cargas: master, wave e protótipo × 5 TFs]`. Os quatro campos
ficam numa linha só (`partTops = 1`) nos 5 TFs.

- **Não regride em outro viewport.** A 1024×1100 (1h/4h), o protótipo e o master dão 59,2. A 1280×800, o
  protótipo e o master dão 72,0 nos 5 TFs `[MEDIDO, n = 14 cargas]`.
- **A forma na tela é a do master.** O cabeçalho e a fileira O·H·L·C ficam na linha 1. O `DERIVADO (…)`
  fica sozinho na linha 2, como já ficava no master (`der` em y = 635 nas duas refs). A única diferença
  visual é a fileira deslocada ~22 px para a direita, junto com o cabeçalho mais largo.

### 1.3 O custo, declarado: a procedência perde ~21–28 px de cauda

O texto visível de `Grandeza: contracts (BTC) · Universo: binance/usdm_futures · Coorte: all`, medido por
caractere com `Range` contra a borda direita do item truncado:

| 1024×768 | master | wave + decisão |
|---|---|---|
| 5m (1m/1h/4h iguais) | `…· Universo: bina…` | `…· Universo: b…` |
| 15m | `…· Universo: bina…` | `…· Universo: …` |
| 1280×800 | `…usdm_future…` | `…usdm_futur…` / `…usdm_futu…` (15m) |

`[MEDIDO 2026-10-03, proto-w8-oi.mjs, n = 4 + 10 cargas]`

- O termo que o operador lê, `Grandeza: contracts (BTC)`, continua inteiro nos 10 casos.
- `Coorte` **já** estava fora da tela no master, a 1024 e a 1280.
- O valor de `Universo` já estava cortado no master (`bina…`). Agora perde 3–4 caracteres, e em 15m o
  rótulo `Universo:` fica sem valor visível. O texto inteiro continua no DOM e no leitor de tela.
- **Por que aceito o custo:** é a regra que já está escrita. `DESIGN-LAYOUT.md` §6 (linha 109) diz:
  *"linha 1, `nowrap` … uma linha que não cabe … nunca diminuir a fonte"*. E o `PaneLegendLine`
  (`SymbolClient.tsx:897-904`) diz: *"the LAST item of the line is the one allowed to shrink … The line
  stays ONE line"*. O defeito foi um item do **meio** da linha também encolher e quebrar, contra essa
  regra. A decisão devolve o encolhimento a quem a regra o deu.

## 2. Alternativas recusadas, com o custo de cada uma

| alternativa | por que não |
|---|---|
| **(a)** `shrink-0` no `OiCandleLegend` inteiro | O `DERIVADO` sobe para a linha 1 (legenda de 1 linha, +16 px de área), mas a procedência fica com ~12 px a 1024: `Grandeza` some. Troca área por `CA-9` `[INFERRED: 938 − 214 − 12 − ~700]` |
| **(b)** forma compacta do `DERIVADO` por `@container/legend` (sugestão da revisão) | Ataca o sintoma. O `DERIVADO` está na linha 2, e o que quebra é o `C` na linha 1. Encurtar o `DERIVADO` mexe na largura-base que entra na divisão proporcional e dá folga **por acaso**, de alguns px. Mexe também em microcopy aprovada (`SPEC-009` §6.2) |
| **(c)** `DERIVADO` na mesma linha do `C` | É a (a) com outro nome, e o custo é o mesmo |
| **(d)** leitura O·H·L·C em grade 2×2 | +1 linha de legenda por construção (2×2 = 2 linhas, mais o `DERIVADO`) ⇒ 48 px, e a área volta a cair |
| **(e)** mover a reserva de 16 px da faixa de regime | Só toca 1h/4h e deixa 1m/5m/15m em 59,2 < 72. Além disso, a reserva é efeito: com a legenda de volta a 32 px, ela nem entra (medido acima) |
| **(f)** procedência `Grandeza · Universo · Coorte` para a linha 2, ao lado do `DERIVADO` | **É a melhor para o `CA-9`**: a linha 2 tem ~470 px vazios a 1024 (`DERIVADO` de x = 215 a ~470, e a linha vai até 938), e a procedência quase inteira caberia. Mas muda a anatomia da camada (`DESIGN-LAYOUT.md` §6: a procedência fica na linha 1). Isso é mudança de layout, que pede Stitch e gate próprios, fora do escopo de um bloqueante de não-regressão. **Fica como proposta de task**, e não como correção do `B-1` |

**Stitch não usado, e o motivo:** a decisão não muda layout. Ela devolve, ao px, a geometria que o master
já tinha (§1.2: mesmo bloco de 32 px, `DERIVADO` no mesmo lugar). A instrução do despacho manda usar o
Stitch para mudança significativa de layout, e isso só vale para a alternativa (f).

**Discovery shadcn:** `search_items_in_registries("legend ohlc inline group nowrap")` respondeu *"No
registries are configured"* `[MEDIDO 2026-10-03]`. A correção é uma classe utilitária num `<span>` que já
existe. Nenhum componente novo.

## 3. O mesmo mecanismo nos outros panes

O mecanismo é **um item que quebra no meio de uma `PaneLegendLine`**.
`grep -n 'flex-wrap' frontend/src/app/symbol/SymbolClient.tsx` devolve **3** linhas `[MEDIDO 2026-10-03 em
a67de6d]`:

| linha | onde | o N-2 o afeta? |
|---|---|---|
| `:2483` | `OiCandleLegend`, **dentro** da `PaneLegendLine` do OI | **sim. É o `B-1`** |
| `:3565` | `data-liquidation-legs-row`, uma **linha irmã** da `PaneLegendLine`, e não um item dela | não. Ela quebra pela largura do bloco da legenda, não do cabeçalho: 135 a 1024 e 155 a 1280, iguais em master, wave e protótipo |
| `:3872` | `LongShortScaleFooter`, rodapé de escala | não. Fica fora de toda `PaneLegendLine` |

Nos outros 9 `<PaneLegendLine>`, o cabeçalho mais largo sai da cauda do último filho, e a revisão mediu
que o A-5 continua de pé (`(escala linear)` e `Dado de TERCEIRO` inteiros nos 10 casos). Áreas a 1024×768,
iguais em master, wave e protótipo nos 5 TFs: price 234,4 · liquidation 135 · long-short 37,6 ·
cvd 44,6 `[MEDIDO, n = 15]`.

**Até onde a correção aguenta.** A fileira quebra de novo só se `cabeçalho + 12 + fileira + 12 >` a
largura da linha. A 1024/15m, o pior caso, isso dá 222 + 429 + 12 = 663 de 938 ⇒ **~275 px de margem**.
Cada dígito a mais no OI custa ~4 × 7,2 ≈ 29 px de fileira `[INFERRED: 4 campos com largura comum em
ch, ~7,2 px/ch a 12 px]` ⇒ cabem ~9 dígitos a mais antes de quebrar a 1024.

## 4. Escopo do builder (estrutura e CSS, nada além disso)

Em `OiCandleLegend` (`frontend/src/app/symbol/SymbolClient.tsx:2475-2532`):

1. Envolver o `OI_LEGEND_FIELDS.map(...)` num
   `<span data-legend-ohlc-row="" className="inline-flex flex-nowrap items-baseline gap-x-2">`.
2. O `<span data-fact="oi_candle_provenance:…">` (o `DERIVADO`) continua irmão do grupo, dentro do
   `inline-flex flex-wrap` externo, que não muda.
3. Não mexer em microcopy, cabeçalho, `data-legend-*`, `PaneLegendLine` nem `OI_REGIME_LABEL_RESERVE_PX`.

Os seletores existentes sobrevivem. `e2e/24`, `36`, `37` e `38` leem `[data-legend-ohlc="oi"]` e os
`[data-legend-ohlc-part]` como **descendentes**, não como filhos diretos (`grep -rn 'legend-ohlc' e2e src`,
5 ocorrências fora de `SymbolClient.tsx`, nenhuma com `>`). O builder confirma isso antes do commit.

## 5. Falsificador: assert de e2e a 1024×768, ao lado do C-3 de `e2e/40`

**F-1, a área por TF, com dado real** (no teste `T-05.4 real data`, `e2e/40:821`):
- Medir a 1024×768 nos **5** TFs. Hoje o laço é `REAGGREGATED_TFS`, que não tem `1m`, e o `1m` tem de entrar
  para o OI.
- Ler `readAreas` (`data-pane-height-px − data-reserved-scale-top-px`).
- Assert `oi-pane` com piso **por TF**: `{1m: 72, 5m: 72, 15m: 72, 1h: 59, 4h: 59}`, os números literais
  do gate.
- O `AREA_FLOORS_1024` atual (`["oi-pane", 58.2]`, um piso só para todos os TFs) **não** pega o
  72 → 59,2 de 1m/5m/15m, e por isso fica insuficiente para o OI.

**F-2, a fileira não quebra, com uma sonda de largura** (nos casos `longestCases` do stub, `e2e/40:744`,
viewport `1024x768`, que rodam no `make verify`):
- Precondição: `Number(oi-pane.dataset.oiCandles) > 0`. Se não houver vela, o teste **reprova** com
  "sem vela, F-2 não mede". Nunca passa no vazio.
- Sonda: `page.evaluate` põe `style.width = "13ch"` em todo
  `[data-legend-ohlc="oi"] [data-legend-numeral]`. Isso simula ~3 dígitos a mais que o real, porque o
  stub pode ter menos dígitos que o dado real, e com poucos dígitos nada quebra em nenhuma das duas
  formas. Esperar dois `requestAnimationFrame`.
- Assert: os quatro `[data-legend-ohlc-part]` (ou o `hl-unmeasured` no lugar de H/L) têm o **mesmo
  `getBoundingClientRect().top`**, e o `top` do `DERIVADO` é **maior** que o deles (ele fica na linha 2).

**Ablação, que tem de REPROVAR** (a forma de hoje, já medida): sem o grupo `nowrap`, F-1 dá 59,2 em
1m/5m/15m e 32,0 em 1h/4h, e reprova nos 5 TFs. F-2 dá `partTops = 2`, porque o `C` desce de linha. Nos
dados reais isso já foi medido (§1.1, "wave hoje"). Na sonda do stub, ver o `[NÃO SEI]` 2. Se F-1 ou F-2
passar com a ablação, o falsificador não vale, e o QA reprova o **teste**, não a tela.

## 6. `[NÃO SEI]`, declarado

1. **Se 72,0 é estável entre cargas.** A medida deu 72,0 exato em 6 de 6 cargas a 1024×768 em
   1m/5m/15m (master e protótipo), e em 20 de 20 a 1280×800. O piso literal do gate (72) tem **0 px** de margem. Se o e2e oscilar abaixo disso (ex.:
   71,99), quem decide afrouxar para `medido − 1` (convenção `C-4`) é o validador, não o builder. A
   regressão que importa (59,2) continua pega com qualquer um dos dois pisos.
2. **Se o stub de `e2e/40` serve velas de OI** e com quantos dígitos. Não medi. Por isso F-2 tem
   precondição e sonda: sem elas, o assert do stub poderia passar no vazio.
3. **Se a sonda de 13 ch quebra a fileira na forma de hoje dentro do stub.** Não medi no stub. No dado
   real, a forma de hoje já quebra sem sonda nenhuma (§1.1). O builder mede a ablação no stub antes de dar o falsificador por
   válido.
4. **Contraste e leitura do `Universo: …` sem valor em 15m a 1024.** É perda de informação sem sinal
   além do `…`. Não medi como o operador lê isso. A alternativa (f) resolve, e fica como proposta.
5. **Por que o master tem 59,2 e não 72 em 1h/4h sem a reserva.** Não investiguei. É pré-existente e igual
   nas três refs, e a decisão não toca nisso.
6. **Nenhum teste com usuário.** O argumento é geométrico (devolve a forma do master) e a medida é
   de DOM no build real. Não é preferência medida.

## 7. Como reproduzir

O script fica no scratchpad da sessão (`proto-w8-oi.mjs`) e **não é versionado**. A receita:

1. `next build` + `next start` de `a67de6d` (`:4391`) e `d2055d9` (`:4392`), com
   `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`.
2. Playwright a 1024×768 em `/symbol/BTCUSDT?interval=<tf>`, `networkidle` + 1,2 s.
3. Ler `data-pane-height-px − data-reserved-scale-top-px` de cada `[data-testid$="-pane"]`, os `top` dos
   `[data-legend-ohlc-part]` e a altura do 1º filho de `[data-pane-legend]` do OI.
4. Para o protótipo, `page.route(/\.css/)` acrescenta `[data-legend-ohlc="oi"]{min-width:429.5px}` ao CSS
   servido. O 429,0 é a fileira medida: a soma das larguras dos 4 campos mais 3 × 8 de `gap-x-2`.
