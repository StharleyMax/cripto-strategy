# W8 — gate de design da decisão do `B-1` (área do OI a 1024×768)

**Veredito: APROVADO COM AJUSTE.** O grupo `nowrap` em O·H·L·C passa como está. O ajuste é na procedência:
um rótulo de termo (`Universo:`, `Coorte:`) **nunca** fica pintado sem o valor. Quando o valor não cabe, o
termo inteiro sai da pintura e a linha termina em `· …`. A regra exata está no §3. O `title` **não** serve
de ajuste aqui (§2.2).

- Gate: `ux-ui-mastery:design-critique` (Liz Lerman CRP + 10 dimensões), invocado via Skill em 2026-10-03.
- Julgado: `handoff/W8-oi-1024-decisao.md` @ `f95d4ba` (`ui-designer`).
- Normas lidas: `gates/W8-DESIGN-REVIEW.md` §B-1 (condição :101-105), `gates/T-05.6-DESIGN-GATE.md` (b),
  `handoff/T-05.4-desenho.md` A-4/A-5 (:407-412), C-2/C-4 (:470, :474), `handoff/DESIGN-LAYOUT.md` §6
  (anatomia, :109), `frontend/src/app/symbol/SymbolClient.tsx` (:873-874, :897-904, :2359-2374,
  :2475-2532, :2779-2783), `docs/specs/PRD-008-candle-real-e-eixo-unico.md` RF-8 (:226) e CA-9 (:279).
- Não medi nada em browser. Todos os números de px abaixo são do `ui-designer` (`W8-oi-1024-decisao.md`
  §1.2, §1.3), e o meu julgamento os toma como entrada. Onde a conclusão depende de medida que ninguém fez,
  ela vira falsificador (§4).

## 1. Statements of meaning: o que proteger

1. **A decisão ataca a causa, não o sintoma.** O diagnóstico do §1.1 confere com o código: a linha é
   `flex-nowrap` com só o último filho em `min-w-0 truncate` (`SymbolClient.tsx:900-902`). O `OiCandleLegend`
   é `inline-flex flex-wrap` (`:2488`), então o `min-content` dele é o maior campo sozinho, e o flex o
   encolhe junto com a procedência. O `nowrap` no grupo devolve o encolhimento ao último filho, que é
   exatamente o que o comentário de `:897-899` e o §6 de `DESIGN-LAYOUT.md` (`:109`, *"linha 1, `nowrap`"*)
   prescrevem.
2. **Cumpre a condição do `B-1` ao px:** 72/72/72/59,2/59,2 nos 5 TFs (§1.2). Não toca o token de TF, que o
   B-1 proibia tirar (`W8-DESIGN-REVIEW.md:113-114`).
3. **Robustez medida, não só conserto do caso de hoje:** ~275 px de margem e ~9 dígitos a mais antes de
   quebrar de novo (§3). O master estava a 0,8 px da quebra, e a decisão registra isso como correção à
   revisão em vez de apagar a frase errada.
4. **As alternativas recusadas têm custo escrito.** A (f), procedência na linha 2, é a melhor para o `RF-8`
   e foi recusada só por escopo, sem ser descartada.

## 2. A pergunta do despacho: `Universo:` sem valor é enganoso ou aceitável?

### 2.1 Não é falso. É um rótulo órfão, e isso não é aceitável como está

- **Não afirma valor errado.** O `…` é o sinal padrão de truncagem (H1) e o texto inteiro fica no DOM e no
  leitor de tela (`:2369`, o `<p>` sem `aria-hidden`). Por isso não é *dark pattern* nem mentira.
- **Mas é um rótulo que promete um valor e entrega zero**, e ocupa ~70 px de uma linha que está em disputa.
  Três problemas, em ordem de peso:
  1. **Leitura ambígua (H1, H2).** `Universo: …` não se distingue de "valor pendente" ou "valor ausente".
     Reticências depois de um rótulo é a convenção comum de *carregando*. A tela já tem ausência explícita
     (`LEGEND_GRID_ABSENCE`) e `Procedência não identificada` (`:2368`). Um terceiro jeito de dizer "não há
     valor aqui", que significa outra coisa, desgasta os dois primeiros `[INFERRED: H2 + convenção de
     microcopy; não testado com o operador]`.
  2. **Ruído sem informação (H8).** É par rótulo-valor (Gestalt de proximidade): o rótulo sozinho é metade
     de uma unidade.
  3. **Sem caminho de recuperação para quem enxerga (H6).** Ver §2.2.
- **Severidade Nielsen: 2 (menor)**. Não bloqueia leitura de OI, porque `Grandeza: contracts (BTC)` e o
  cabeçalho `Open Interest <TF> (5m, BTC)` ficam inteiros. Mas é barato de corrigir, e é a mesma classe de
  defeito que a revisão já viu no `N-1b` (oclusão sem sinal).
- **O mesmo vale para `b…`** em 1m/5m/1h/4h (§1.3). Um caractere não é valor. A regra do §3 trata os
  dois casos juntos, e não só o 15m.

### 2.2 Por que `title` com o texto completo NÃO é o ajuste

- A camada inteira do pane é `pointer-events-none` (`PANE_LAYER_CLASS`, `SymbolClient.tsx:873-874`), e só
  devolve `pointer-events-auto` a `a` e `button`. Um `<p>` lá dentro **nunca** é alvo de hover, então o
  tooltip de `title` **não aparece** `[INFERRED: semântica de pointer-events: none — o elemento sai do
  hit-test; NÃO MEDIDO em browser]`.
- O projeto já tem a regra: `T-05.4-desenho.md:470` (C-2), *"o texto longo … vai em nó `sr-only` real,
  nunca em `title`"*.
- ⚠️ **Achado lateral, não bloqueante para esta decisão:** pela mesma razão, o `title` dos cabeçalhos
  exigido em `T-05.6-DESIGN-GATE.md` (b).4 (`:158`, hoje em `:2782` etc.) também é inerte na tela. O próprio
  gate já não o tratava como defesa principal (`:132-135`), então o veredito (b) **sobrevive**. Mas a frase
  *"o `title` ajuda na descoberta"* é falsa enquanto a camada for `pointer-events-none`. Registro aqui em
  vez de reabrir (b). Falsificador: a 1280×800, `document.elementFromPoint` no centro do `<h2>` do OI
  devolve o `<h2>` ⇒ esta nota cai.

### 2.3 Por que não "esconder o rótulo junto" no corte por caractere

Esconder o termo inteiro sempre que não cabe inteiro (tudo atômico) piora a 1280. Lá o master mostra
`Universo: binance/usdm_future…` e a decisão mostra `…usdm_futur…` (§1.3): o termo não cabe inteiro, mas o
valor visível é quase todo e é informativo. Tornar o termo atômico apagaria isso no viewport principal.
A regra do §3 cola o rótulo só ao **primeiro segmento** do valor, e o resto continua truncando por
caractere.

## 3. AJUSTE obrigatório: regra exata

**Regra:** na procedência do OI, cada termo depois do primeiro é pintado como
`· <Rótulo>: <cabeça><resto>`. O trecho `<Rótulo>: <cabeça>` é **atômico**: ou aparece inteiro, ou não
aparece, e nesse caso a linha termina em `· …`. `<cabeça>` é o valor até o primeiro `/`, sem incluí-lo, ou o
valor inteiro se não houver `/`. `<resto>` trunca por caractere com `…`, como hoje.

**Implementação, em `OiProvenance` (`SymbolClient.tsx:2359-2374`), sem mudar microcopy:**
1. O `<p>` passa a ter filhos: o texto `Grandeza: <g>`, depois para cada termo seguinte
   (`Universo`, `Coorte`) o texto ` · ` **fora** do span, e
   `<span className="inline-block">{Rótulo}: {cabeça}</span>{resto}`.
2. O `textContent` do `<p>` fica **byte a byte igual** ao de hoje (`:2369`). O `data-fact`, o caso
   `provenance === null` e a classe do `<p>` não mudam. O `truncate` continua vindo da `PaneLegendLine`.
3. O mecanismo é o do CSS: com `text-overflow: ellipsis`, um elemento *inline* atômico que não cabe é
   escondido inteiro, e não cortado `[DOC: CSS Overflow Module Level 3, §text-overflow — "hide characters
   and atomic inline-level elements at the end edge of the line"; NÃO MEDIDO no Chromium deste projeto]`.
   Se o Chromium cortar o `inline-block` no meio, o F-3 reprova e o builder devolve a pergunta ao gate. Ele
   **não** troca por outro mecanismo sem gate.

**O que se espera na tela** `[INFERRED a partir de §1.3 do handoff; o F-3 confirma]`:

| viewport | hoje com a decisão | com o ajuste |
|---|---|---|
| 1024, 5 TFs | `…(BTC) · Universo: b…` / `Universo: …` (15m) | `Grandeza: contracts (BTC) · …` |
| 1280, 5 TFs | `…Universo: binance/usdm_futur…` | igual |

**O custo do ajuste, declarado:** a 1024 some o `b` (e o `bina` do master). Um prefixo de 1 a 4 letras de
um nome de exchange não é valor. O operador perde zero informação e ganha uma linha que não finge ter um
termo que não mostra. Em troca do `Universo` sumir a 1024, a linha diz `· …`: há mais, e não coube.

**O débito que fica, e não é desta decisão:** o `RF-8` (`PRD-008:226`, o rótulo *soletra* grandeza ·
universo · coorte) **já não era cumprido na tela** no master, que não mostrava `Coorte` a 1024 nem a 1280.
O `CA-9` só mede o `data-fact` (`PRD-008:279`), por isso nunca viu isso. A alternativa (f) do handoff, que
põe a procedência na linha 2 ao lado do `DERIVADO`, é o conserto. **Endosso abrir task própria, com Stitch
e gate.**

## 4. Falsificadores

Somam-se ao F-1 e ao F-2 do handoff (§5), que aprovo com uma emenda no piso.

- **F-1, emenda (resposta ao `[NÃO SEI]` 1 do handoff):** o piso por TF segue `C-4`
  (`T-05.4-desenho.md:474`, medido − 1 px): `{1m: 71, 5m: 71, 15m: 71, 1h: 58,2, 4h: 58,2}`. A regressão
  que o `B-1` existe para pegar (59,2 e 32,0) reprova com 12 px e 26 px de folga. Um piso com 0 px de
  margem reprova o sub-pixel e ensina o próximo leitor a ignorar o teste. O relatório do QA grava o
  **valor medido**. Se ele ficar abaixo de 72,0 em 1m/5m/15m ou de 59,2 em 1h/4h, o `B-1` **não** fecha,
  mesmo com o e2e verde.
- **F-2:** aprovado como está, incluindo a precondição `oiCandles > 0` e a ablação.
- **F-3, novo (o ajuste), no teste de dado real `e2e/40:821`, a 1024×768, nos 5 TFs:**
  - para cada `Range` do texto `Universo:` e `Coorte:` dentro de `[data-fact^="oi_provenance:"]`: se a
    largura visível do rótulo (∩ retângulo do `<p>`) for > 0, a largura visível da `<cabeça>` do mesmo termo
    tem de ser **igual** à largura total dela;
  - a largura visível de `Grandeza: <valor>` tem de ser igual à total (o termo que o operador lê, A-5);
  - o `textContent` do `<p>` tem de ser igual à string de `:2369`.
  - **Ablação que tem de REPROVAR:** tirar o `inline-block` do span. A 1024/15m, o `Universo:` fica visível
    com a cabeça a 0 px (a forma da decisão sem ajuste, §1.3 do handoff). Se o F-3 passar com a ablação, o
    falsificador não vale, e o QA reprova o **teste**.
  - **Contra-ablação a 1280×800:** a cabeça `binance` fica visível inteira e o resto trunca. Se a 1280 o
    `Universo` sumir inteiro, o ajuste piorou o viewport principal e **este veredito cai**.
- **Falsificador deste gate como um todo:** se o operador, perguntado, ler `Grandeza: contracts (BTC) · …`
  como "a série não tem universo", a regra do `· …` erra e a (f) passa de proposta a necessidade.

## 5. Notas (1-10)

| dimensão | nota | observação |
|---|---|---|
| Clareza | 7 | O·H·L·C de volta numa linha. O rótulo órfão tira ponto até o ajuste |
| Consistência | 9 | devolve a regra escrita: só o último filho encolhe (`:897-904`, `DESIGN-LAYOUT.md:109`) |
| Hierarquia | 8 | o dado (O·H·L·C) vence a procedência na disputa por largura, que é a ordem certa |
| Eficiência | 8 | uma classe num `<span>` que já existe, e nenhum componente novo |
| Acessibilidade | 8 | texto inteiro no leitor de tela. O `title` não salvaria quem enxerga (§2.2) |
| Design emocional | 7 | n/a de fato. Uma linha estável transmite confiabilidade |
| Resiliência a erro | 8 | ~275 px de margem medida contra o próximo dígito |
| Carga cognitiva | 7 | `Universo: …` é ruído. O ajuste o tira |
| Inovação | 6 | conserto correto e conservador, sem pretensão de inovar |
| Acabamento | 8 | diagnóstico ao px, correção da revisão escrita, ablações declaradas |

**Média: 7,6/10.** Com o ajuste aplicado e o F-3 verde, a decisão fecha o `B-1` pelo lado do design.

## 6. Declarado, em vez de escondido

- `[NÃO MEDIDO]` Nada foi medido em browser por este gate. Os px são do handoff, e o comportamento de
  `inline-block` sob `text-overflow` no Chromium é `[DOC]` da especificação, a confirmar pelo F-3.
- `[INFERRED]` O `title` inerte sob `pointer-events-none` (§2.2), com falsificador escrito.
- `[NÃO SEI]` Se o operador lê `· …` como "há mais" (a intenção) ou como "carregando". Ninguém testou com
  usuário.
- `[NÃO SEI]` O `[NÃO SEI]` 5 do handoff (por que o master dá 59,2 e não 72 em 1h/4h) continua aberto e
  fora do escopo. A decisão não piora nem melhora isso.
