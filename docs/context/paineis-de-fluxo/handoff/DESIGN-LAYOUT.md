# DESIGN-LAYOUT — `paineis-de-fluxo`: a S2 em panes empilhados (2026-09-23)

**Autor:** `ui-designer` (operador do Stitch) · **Gate:** `ux-ui-mastery` (`/ux-ui-mastery:design-critique`, rodado como
processo `claude -p` independente, sem acesso de escrita ao Stitch)

## 0. Estado, em uma tabela — leia isto antes de tudo

| | |
|---|---|
| **tela nova** | **`bc317e03a98c4d5998a7eae94c695a34`**, *"S2 Símbolo — Painel Multi-Série (7 Panes)"*, `x=6080`, bifurcada de `8174…` por `edit_screens` `[MEDIDO: get_project.screenInstances + list_screens, 2026-09-23 20:30Z]` |
| **veredito do gate** | **`NEEDS_FIX` — 5.9/10**, 10 must-fix · relatório: [`../gates/DESIGN-LAYOUT-ux-critique-r1.md`](../gates/DESIGN-LAYOUT-ux-critique-r1.md) |
| **canônica da S2** | **continua `8174234965cd4ffbacfb7b2a0a61a427` (Rev. B)**. `bc317e03` é **candidata reprovada**, não canônica. Nenhuma decisão de design desta página vale antes de o validador concordar (`CLAUDE.md` §Design) |
| **rodada 2** | **NÃO MATERIALIZOU.** 3 chamadas `edit_screens` (2 sobre `bc317e03`, 1 sobre `8174` com a especificação consolidada), todas `timeout` — o modo B de `STITCH_CONTEXT.md` §5.3-bis — e **nenhuma produziu tela nem alterou arquivo** em 11–25 min cada `[MEDIDO: get_screen devolveu o MESMO files/746d0487… e files/6a64ce20…; list_screens com as mesmas 13 telas; 20:32Z–21:34Z]`. `[NÃO SEI]` a causa (cota, tamanho, falha do servidor): `project.updateTime` avançou nas três (20:39, 20:59, 21:16), então o servidor **recebeu** as chamadas |
| **próximo passo** | reemitir a rodada 2 — a instrução está em [`stitch/instrucao-rodada2-sobre-bc317e03.txt`](stitch/instrucao-rodada2-sobre-bc317e03.txt), **precedida do §9 verbatim** (`R3`) — e voltar ao gate com a mesma contagem por SVG |

`R1` segue inexecutável: `GEMINI_3_1_PRO` não existe no enum do MCP (`MODEL_ID_UNSPECIFIED` · `GEMINI_3_8_FLASH` ·
`GEMINI_3_5_FLASH_LITE`) `[MEDIDO: schema do tool, 2026-09-23]`. Chamadas feitas **sem `modelId`** (default do servidor),
precedente de [`cinco-metricas-do-core/gates/design-04.md`](../../cinco-metricas-do-core/gates/design-04.md) §0.1. A
pendência continua do owner.

## 1. O que foi pedido, e a fonte

`[PREMISSA-OWNER: 2026-09-23]` — *"Quero ter essa visão do volume, OI e liquidações. Inclusive o ajuste em como o gráfico
é apresentado, pq hj ta uma presepada feia para caralho. então vamos manter essa forma de separação bem procima da
coinalyze e tradingview."* ([`DISCOVERY.md`](DISCOVERY.md) §1). Referência:
[`referencia/coinalyze-tradingview-2026-09-23.png`](referencia/coinalyze-tradingview-2026-09-23.png).

`R5`/`R7` (S2 é núcleo, mudança escala ao owner): a mudança **é do owner**, na citação acima. A edição bifurca, então a
canônica `8174…` fica intacta até um veredito `APPROVED`.

## 2. As decisões, com argumento, fonte e falsificador — e o que o gate disse de cada uma

| # | decisão | argumento · fonte | gate r1 | falsificador |
|---|---|---|---|---|
| **D1** | **um gráfico, 7 panes empilhados**, um só eixo de tempo no rodapé, crosshair vertical compartilhado, sem card/moldura/scroll | é a estrutura da referência; `§9` item 16(l): painéis que exigem rolagem não compartilham crosshair | **ACEITO com condição (MF-10)** | o owner, em uso, não consegue atribuir um rótulo de eixo ao pane certo |
| **D1-bis** | separador `#222634` no plot **+ `#8b949e` na coluna do eixo** + ≥8px entre rótulos | o gate mediu `#222634` a **1.19:1** contra o plot; `#8b949e` é token existente (tinta fraca), não superfície nova (`§9` item 9) | *proposto na rodada 2, não avaliado* | medida no render < 3:1 na coluna do eixo |
| **D2** | selo de 4 campos em **uma linha** sobreposta ao topo-esquerdo de cada pane, valor sob o crosshair | referência (nome + último valor) **somado** a `§9` item 10 (4 campos, sem hover) | **ACEITO** na forma; **DERRUBADO** em "idade uma vez por tela" | — |
| **D2-rev** | ⚠️ **REVISTA pelo gate, e eu estava errado:** a idade é **por série**, na borda direita **do pane** | `§9` item 10 define idade = T − `available_at` **da série**; [`ADR-005`](../../../adr/ADR-005-transporte-de-leitura.md):70 fala do chip de idade por `cadência_nativa`, que é da série. Minha leitura de *"um gráfico de 3 dias tem zero carimbos"* como "um carimbo por tela" confundiu **ao longo do tempo** (proibido) com **por série** (obrigatório) | MF-1 | — |
| **D3** | **volume no rodapé do pane de preço, com a forma da vela** (vazado verde / cheio vermelho / `#8b949e` no doji) | redundância de forma de [`ADR-010`](../../../adr/ADR-010-governanca-de-cor-por-tipo-de-marca.md) D-2 estendida à barra: sem ela, o volume colorido reprova SC 1.4.1 (razão de luminância 1.09 entre os fills) | **ACEITO** (SF-1: faixa de ~23% → ~13%) | — |
| **D4** | **OI em vela**, mesmo predicado (`close > open` ⇒ vazado), explicado em palavra na legenda | `§9` item 2: *"a forma codifica o PREDICADO, não a palavra 'alta'"*; a leitura "entrou contrato" é a fala do owner em DISCOVERY §1 | **ACEITO** (SF-4: "entrada **líquida**") | EX-2 do gate: o owner lê a vela vazada de OI como "preço subiu" |
| **D5** | **liquidações num pane: short liquidado ↑, long liquidado ↓, as duas em `#e6e9ef`** (`provenanceStrong`, o MESMO token que o código de hoje usa, `SymbolClient.tsx:999`) | posição: `liquidation_catalog.py`, citado em `SymbolClient.tsx:1879` — *"a long liquidation is forced selling and a short liquidation is forced buying"*. Cor: **deliberadamente não decidida** | **ACEITO COMO PROVISÓRIO** | Q3 respondida com fonte lida |
| **D6** | funding em **degrau**; L/S e CVD acumulado em linha 1px; CVD delta em barras vazada/cheia | degrau não interpola entre fechos de 8h (`§9` "ausência nunca é interpolada") | **ACEITO** | — |
| **D7** | **janela única de 24h** e denominadores no grid nativo de cada série (`96/96`, `287/288`, `76/1440 · 1364 ausentes`, `3/3`) | MF-5/MF-6: a r1 desenhava ~17h, declarava 24h em 4 panes e 96h em 2, e rareava marcas na metade direita sem marca de ausência. `1364 ausentes` é **ilustrativo**, arredondado de `SymbolClient.tsx:1885` (`1.365 absent of 1.441 grid slots over 24 h`, medido em 2026-09-16 — o denominador real é 1441, não 1440) | *proposto na rodada 2* | — |
| **D8** | séries `coinalyze` levam **`◇ QUARENTENA`** e **`◇ idade ?`** (canal de integridade), não um número de idade | `§9` item 10: atraso não medido ⇒ a idade vai para o canal de integridade. `coinalyze-fora-da-quarentena` está em `SPEC_APPROVED`, não `DONE` `[MEDIDO: harness pipeline state coinalyze-fora-da-quarentena]` | MF-2 (o gate pediu) | o estado por série no ledger diz que já saíram da quarentena |

**Discovery de componente:** `get_project_registries` → vazio (sem `components.json`); `search_items_in_registries("chart")`
→ `@shadcn/chart` (Recharts). **Rejeitado**, pelo mesmo motivo de `DESIGN_SYSTEM.md` §6.1: seria um segundo motor de
gráfico ao lado do `lightweight-charts`. Panes são configuração do `lightweight-charts` v5 (`addPane`/`paneIndex`), não
componente — e a decisão 1-chart × 6-charts é do `frontend-architect` (DISCOVERY §3 Q6), **não** deste documento.

**Recusado por mim, com argumento — o gate pode discordar na r2:** SF-2 (barra de liquidação mais apagada). Vazar a barra
colide com o vocabulário de forma (vazado = `close > open`); descer para `#8b949e` colide com o traço de **ausência**, que
já é `#8b949e` (`SymbolClient.tsx:997`). O token atual fica até Q3.

## 3. A medição da rodada 1, e o limite do instrumento

`python3 scripts/verify_screen.py bc317e03-rodada1.html` ⇒ **REPROVADO (5)**. Três delas (**E2** ×2, **E4**) são
**falso negativo do instrumento**: `classificar()` só lê `class="…"` Tailwind, e a r1 desenha velas em **SVG por atributo**.
Contagem por atributo (script de 10 linhas no scratchpad, `re` sobre `<rect fill= stroke=>`): **136** vazados
(`#131722`/`#089981`), **86** cheios (`#f23645`), **9** barras de liquidação `#e6e9ef`, **6** doji de volume `#8b949e`,
**0** retângulo preenchido de verde `[MEDIDO, n=237 rects]`. As outras duas (**E5-palavra**, **E6-idade**) eram defeito
real (F1/F2). ⚠️ **E6 vai acusar a rodada 2 também, e a acusação será falsa:** ele reprova `n_idade > 1` na tela inteira,
o que só era correto na Rev. B, onde uma série só tinha idade. **Proposta, não aplicada** (o instrumento é de `docs` e não
cabe a quem é medido reescrever a régua): E2/E4 lerem atributos SVG; E6 contar por pane.

## 4. `[NÃO SEI]` — o que esta página não sabe

1. **Q3 — cor da liquidação.** Nenhuma fonte lida. As duas coortes estão num token neutro nomeado (`provenanceStrong`) e a
   coorte se lê por posição + palavra. Dono: `quant-architect`.
2. **Direção short↑/long↓ bate com a Coinalyze?** O gate a sustentou por co-movimento na imagem da referência
   (`[INFERRED]`, não fonte lida).

   > **ACRÉSCIMO, mesma data — achado depois da rodada 1, e não reescreve o item acima.** Em paralelo, o
   > `quant-architect` leu fonte: [`LIQ-1-julgamento-quant-architect.md`](LIQ-1-julgamento-quant-architect.md) Q1 —
   > short **para cima / cor de alta**, long **para baixo / cor de baixa**, convenção Coinalyze `[DOC]`; a TradingView
   > *Markets* discorda (long verde, para cima) `[DOC]`; a escolha pela Coinalyze é `[INFERRED]`, e
   > [`ADR-044`](../../../adr/ADR-044-um-grafico-com-panes-nativos-v5-a-legenda-le-o-slot-e-a-perna-long-desce-por-escala-invertida.md)
   > D4 a herda (`SPEC-009` §7.1). ⇒ a **posição** do mock coincide; a **cor** do mock (neutra nas duas pernas) é a
   > que o despacho pediu (Q3 "aberta") e **agora diverge da proposta do `quant-architect`**. Não troquei sem gate: se a
   > cor por perna for adotada, o próprio gate (EX-1) exige que ela venha **com redundância de forma**, nunca cor
   > sozinha — e *vazado* já significa `close > open` neste sistema, então a forma da perna **não pode ser vazado/cheio**
   > (`[NÃO SEI]` qual forma: a posição acima/abaixo do zero pode bastar como canal não-cromático — é a pergunta para a
   > rodada 2 do gate). E Q5 do mesmo julgamento: vela de OI sem pavio em `5m` é *não observado*, não *não se moveu* —
   > o mock em `5m→15m` desenha pavio; em `5m` puro teria de declarar isso.
3. **Atraso do endpoint Coinalyze** — não medido; por isso `idade ?`.
4. **Estado de quarentena por série** (OI OHLC e liquidações) — inferido do estado da feature, não lido no ledger por série.
5. **Q1** (OI agregado × uma exchange) e **Q4** (vela de OI em TF < 5m): o mock usa `OHLC 5m→15m`, onde a pergunta não
   aparece. Em `1m` ela aparece.
6. **Por que a rodada 2 não materializou** (ver §0).
7. **Coerência do mock com `COMO EM T (2023-10-26T14:30Z)`**: a janela desenhada e as idades são ilustrativas; `ADR-005`:70
   troca o chip de idade pelo rótulo absoluto quando o viewport termina antes de `agora − cadência`.

## 5. Tensão com o §9 — proposta, não aplicada (`R3`/`R8`)

O §9 ainda lista a S2 como *"Preco, OI, CVD delta, CVD acumulado"* e põe *"painel de liquidacao"* em FORA DE ESCOPO. O
produto já tem liquidações (`T-05.9`) e o owner pediu os 7 panes. Nos prompts, colei o §9 **verbatim** e acrescentei, na
instrução, que "painel de liquidação" ali significa feed/dashboard `[INFERRED]`. Atualizar o §9 é edição do artefato mais
copiado do repositório ⇒ `ADR`, não prompt; fica **proposto**.
