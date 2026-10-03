# W8 — design-review (T-05.6 na wave W8 de `paineis-de-fluxo`)

**Veredito: CHANGES_REQUESTED — 74/100.** Um achado bloqueante (`B-1`) e 4 condições não bloqueantes.
O que a T-05.6 se propôs a corrigir (N-1/R-1 e N-2) está correto na tela. O bloqueio é um efeito
colateral do N-2 que nenhum teste mede: a 1024 px, o pane de Open Interest perde área de dado.

- Gate independente: `ux-ui-mastery:design-review`, invocado via Skill em 2026-10-03.
- Alvo: `wave/paineis-f06 @ a67de6d`, `/symbol/BTCUSDT`. Referência: `master @ d2055d9`.
- Procedimento igual ao de `W7-DESIGN-REVIEW.md`. Cada ref foi extraída com `git archive` para o
  scratchpad, com `node_modules` por hard link. Depois `next build` + `next start` em `:4391` (wave) e
  `:4392` (master), com `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000` e acesso por `localhost`. Os
  dois servidores foram derrubados por pid no fim. Não rodei `make verify` nem e2e.
- Normas aplicadas: `gates/T-05.6-DESIGN-GATE.md` ((a), (b).4 e falsificadores),
  `gates/W7-DESIGN-REVIEW.md` (N-1 a N-5) e `gates/W8-QA-FRONT.md` (WARNING-1 e WARNING-4).
- Evidência: 20 PNGs de página inteira (`{wave,master}-{1024,1280}-{1m,5m,15m,1h,4h}.png`), a tira
  comparativa `ls-strip.png` e os scripts `shoot.mjs`, `n1b.mjs`, `a4.mjs` e `oi2.mjs`. Tudo ficou no
  scratchpad da sessão e **não é versionado**: o commit deste gate contém só este arquivo.

## O que a T-05.6 resolve (medido na tela)

### N-1 / R-1: a faixa "Últimas 4 h"

Medi a largura visível da etiqueta: o retângulo dela intersectado com todo ancestral que recorta, até o
viewport `[MEDIDO 2026-10-03, n1b.mjs, n = 20 cargas]`.

| TF | wave 1024 | wave 1280 | master 1024 | master 1280 |
|---|---|---|---|---|
| 1m | **91/91** | **91/91** | fora da tela (−849) | fora da tela (−1104) |
| 5m | 91/91 | 91/91 | 91/91 | 91/91 |
| 15m | 91/91 | 91/91 | 91/91 | 91/91 |
| 1h | **91/91** | **91/91** | 35/91 | 47/91 |
| 4h | **91/91** | **91/91** | 47/91 | 62/91 |

- A etiqueta aparece inteira em 10 de 10 casos na wave, contra 4 de 10 no master. Ganho que o W7 não
  tinha nomeado: em **1m** a etiqueta do master ficava **fora da tela**, porque estava ancorada à
  esquerda de uma faixa que começa em x = −949. Na wave ela aparece.
- Falsificador 1 de (a), "a borda direita da etiqueta nunca passa a borda do plot": não disparou.
  - A borda direita da etiqueta coincide com a da faixa nos 10 casos.
  - A faixa fica ≤ `data-recent-band-plot-width-px` nos 10 casos (ex.: 1024/1h, faixa 904–935, plot de
    944 px).
- Faixa recortada em 1m: `data-recent-band-clipped=left` e `border-left-width: 0px` às duas larguras.
  Isso confirma na tela o caso que a WARNING-1 do QA diz ter só prova por regex
  `[MEDIDO: shoot.mjs, wave 1024/1m e 1280/1m]`. **A medida não substitui o teste.** A recomendação da
  WARNING-1 continua de pé.

### N-2: o cabeçalho do pane com o TF ativo

Conferido em 7 cabeçalhos × 5 TFs × 2 larguras `[MEDIDO: shoot.mjs]`:

| exigência de (b).4 | resultado |
|---|---|
| texto visível `<nome> <TF> (<nativa>, <unidade>)` | ✓ `Preço 1h (1m, USDT)`, `Open Interest 1h (5m, BTC)`, `Long/short de contas 1m (5m, ratio)` |
| `sr-only` dentro do heading | ✓ ` — barras de 1h, série nativa de 1m` |
| `title` com o texto exato | ✓ `Barras de 1h · série nativa de 1m, USDT` |
| sem `aria-label` no heading | ✓ `aria-label = null` nos 7 headings × 20 cargas |
| sem transformação de caixa | ✓ `text-transform: none` no heading e no botão de TF ativo |
| token igual ao botão ativo | ✓ `activeTf` igual ao token do heading nos 20 casos |

- A-5/C-3 a 1024: `(escala linear)` e `Dado de TERCEIRO` têm largura visível igual à largura total nos
  10 casos da wave (ex.: 1024/4h com 611/611 e 255/255).
- A 1280 o OI não muda, nos 5 TFs.

## ⛔ B-1 (BLOQUEANTE): a 1024 px o N-2 tira de 18 % a 46 % da área de dado do Open Interest

**O que acontece.** O token de TF alarga o heading `Open Interest` em +23 px (8–180 → 8–203 a 1024/1h). A
leitura O·H·L·C ao lado tinha, no master, cerca de 12 px de folga (`C` terminava em x = 621 e
`Grandeza…` começava em 634). Com o heading mais largo, o `C` quebra de linha
`[MEDIDO: oi2.mjs, árvore da legenda]`:

- a linha da legenda passa de **2 para 3** linhas: a altura do primeiro bloco vai de 32 para 48 px em
  todos os TFs;
- em 1h e 4h isso ainda faz entrar o `data-oi-regime-label-reserve` (+16 px). A causa é o mecanismo
  `T-03.12`, que já existia, entra quando a faixa fica curta e encolhe o plot de novo.

**Quanto.** A área de dado foi medida com a régua de §3.2 de `handoff/T-05.4-desenho.md`
(`data-pane-height-px − data-reserved-scale-top-px`) `[MEDIDO 2026-10-03, a4.mjs]`:

| viewport | TF | master | wave | perda |
|---|---|---|---|---|
| 1024×768 | 1m, 15m | 72 | **59** | −13 px (−18 %) |
| 1024×768 | 1h, 4h | 59 | **32** | −27 px (−46 %) |
| 1024×1100 | 1h, 4h | 59 | **32** | −27 px |
| 1280×800 | os 4 TFs medidos | 72 | 72 | 0 |

Em 5m a legenda do OI também passa de 54 para 70 px (`panes.mjs`). A mesma tabela confirma que os
outros panes não mudaram: price 234, liquidation 135/155, long-short 38 e cvd 45, iguais nas duas refs.

**Na tela** (`wave-1024-1h.png` contra `master-1024-1h.png`):
- a escala de preço do OI cai de 4 marcas para **1** (`100000.00`), e essa marca fica sob a linha de dado;
- o plot fica com cerca de 45 px entre a legenda e o eixo, e a curva de 7 dias vira quase uma reta.

**Por que bloqueia, mesmo sem piso declarado a 1024:**
1. **A regressão é causada pela própria wave.** Em W7, o N-5 aceitou a área do OI em torno de 60 px como
   pré-existente. A W8 a leva para 32 px.
2. **1024×768 é o piso de viewport declarado** (§10.4, citado no W7).
3. **A premissa que aprovou o orçamento do N-2 é falsa para este pane.** `handoff/T-05.6-n2-decisao.md:93-95`
   diz `[INFERRED]` que *"os outros asserts ficam protegidos por monotonia"*. A medida acima refuta isso
   para o OI a 1024. O A-4 do OI só é cobrado a 1280×800, e por isso nenhum portão viu a quebra. A
   folga do master era de cerca de 12 px, e o N-2 acrescenta cerca de 23 px.

**Condição para virar APPROVED.** O `ui-designer` ou o `frontend-builder` escolhe a forma, e o falsificador
é a medida:
- A 1024×768, nos 5 TFs, a área de dado do OI fica **≥ o valor do master**: ≥ 72 px em 1m, 5m e 15m, e
  ≥ 59 px em 1h e 4h.
- A medida vira assert de e2e a 1024×768, ao lado do C-3 do `e2e/40`.

Direções possíveis, não prescritas:
- deixar a linha O·H·L·C do OI sem quebra e truncar a procedência antes;
- mandar `DERIVADO (OHLC de amostras 1m · ADR-045)` para a forma compacta, por container query, como o
  chip de cobertura já faz;
- pôr o rótulo `DERIVADO` na mesma linha do `C`.

O que **não** vale como correção: tirar o token de TF do heading do OI. Isso reabre o N-2 e quebra a
consistência de posição de (b).1.

## Condições NÃO bloqueantes

### N-1b, confirmado e **melhor que no master**

Não foi introduzido por esta wave. Medi os caracteres da linha `Idade da última observação…` que ficam
sob a etiqueta opaca (`Range` por caractere ∩ etiqueta visível) `[MEDIDO: n1b.mjs, n = 20]`:

| | wave | master |
|---|---|---|
| valor da idade (`57 min 44 s`) coberto | **0 de 10** | **1 de 10**: a 1024/5m esconde `ção: 1 min 48 ` |
| a 1024 | esconde a hora de publicação, ex. `0-03 03:01 UTC` (5 de 5 TFs) | varia: `10-03 04:16 UT`, `TC).` |
| a 1280 | esconde `· nativa de 5m` (5 de 5 TFs) | `cada em 2026-1`, `5min se`… |

- O falsificador de `N-1b` não dispara: o nó do **valor** da idade nunca intersecta a etiqueta.
  - Lido ao pé da letra (o `<p data-fact=long_short_age>` inteiro), ele dispararia a 1024. Interpreto
    "nó do valor" como o valor, não o parágrafo, e declaro isso como `[INFERRED]`.
- Defeito residual: oclusão sem sinal, com sobra visível à direita da etiqueta (`C`, `TC)`) a 1024. Ela
  esconde **a hora** do carimbo de publicação, que é a parte que muda.
- Pede task própria. A direção do T-05.6-DESIGN-GATE vale: `padding-inline-end` na linha igual à largura
  da etiqueta + 8 px, para a linha truncar com `…`.

### WARNING-1 do QA

O 1m está correto na tela (ver N-1 acima), mas continua sem prova comportamental. Acrescentar `1m` ao laço
de `e2e/41`.

### WARNING-4 do QA

A gramática `<nome> <TF> (<nativa>, <unidade>)` e a regra "sem transformação de caixa" ainda faltam em
`docs/product/DESIGN_SYSTEM.md`.

### Tempo de carga, que **não** mede a T-06.3 aqui

| | TTFB | `networkidle` |
|---|---|---|
| wave | 5,4–7,6 s | 6,0–8,2 s |
| master | 5,4–9,7 s | 6,0–10,2 s |

`[MEDIDO: shoot.mjs, 1 carga por célula, sequencial]`

- As duas refs consultam **a mesma API em `:8000`**, que não é a da wave. A T-06.3 é de backend
  (SkipScan + 2 workers), então este ambiente **não consegue** ver o efeito dela `[NÃO MEDIDO]`.
- O front da wave não acrescenta tempo: a diferença fica dentro do ruído de uma carga por célula.
- A medida oficial é a do orquestrador, depois do deploy.

## Notas por domínio (`ux-ui-mastery:design-review`)

| domínio | nota | peso | resumo |
|---|---|---|---|
| Heurísticas (Nielsen) | 8 | 1,5 | o rótulo da faixa diz a verdade (H2), e o heading bate com o botão ativo (H4) |
| Fundamento de pesquisa | 8 | 1 | parte de achados medidos no W7, e a escolha de âncora foi provada por mutante |
| Mobile | 5 | 0,5 | fora do escopo, porque o piso é 1024×768 |
| Desktop | 6 | 1,5 | a 1280 está limpo; a 1024 o OI perde 46 % da área de dado (`B-1`) |
| Visual | 7 | 1,5 | a etiqueta inteira nos 10 casos; ainda há oclusão `N-1b` com sobra de caracteres |
| Acessibilidade | 8 | 1,5 | (b).4 cumprido à letra: `sr-only` real, `title`, sem `aria-label`, sem transformação de caixa; contraste não medido |
| Interação | 7 | 1 | troca de TF intacta; o ao vivo segue indisponível neste ambiente (CORS, 6 erros/carga nas duas refs) |
| Prontidão futura | 6 | 0,5 | `data-recent-band-*` e `title` deixam a tela legível por máquina |
| Arquitetura de sistema | 7 | 1 | os headings vêm de uma função só (`resolvePaneHeadings`); falta medir o orçamento de largura a 1024 |
| Ética e conteúdo | 9 | 1 | a régua exclusiva remove um rótulo que mentia por uma barra |

**Ponderado: 74/100.** Conta: Σ(nota × peso) = 81,5, dividido por Σpeso = 11, vezes 10. Os pesos
privilegiam a ferramenta desktop de leitura densa.

## Declarado, em vez de escondido

- `[NÃO MEDIDO]` Contraste WCAG da etiqueta (`text-provenance-weak` sobre `bg-surface-lowest`).
- `[NÃO MEDIDO]` Ao vivo: CORS desta origem, igual nas duas refs e igual ao W7.
- `[NÃO SEI]` Se a folga de cerca de 12 px do OI no master se mantém com outros valores de OHLC. Ela
  depende do número de dígitos, então o master também é frágil. O `B-1` mede a regressão de hoje, não a
  robustez de amanhã, e o e2e pedido deve usar o dado real.
- `[INFERRED]` A leitura de "nó do valor de idade" no falsificador de `N-1b`, explicada acima.
- Nenhum teste com usuário.
