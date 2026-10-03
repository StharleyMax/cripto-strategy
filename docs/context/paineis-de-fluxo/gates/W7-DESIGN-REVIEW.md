# W7 — design-review (fase 05 de `paineis-de-fluxo`, FIX de uso 2026-10-02)

**Veredito: APPROVED — 80/100**, com 5 condições **não bloqueantes**. Nenhum achado bloqueante.

- Gate independente: `ux-ui-mastery:design-review` (invocado via Skill), 2026-10-02.
- Alvo: `wave/paineis-f05 @ acce0b3`, `/symbol/BTCUSDT`, build de produção (`next build` + `next start -p 4381`,
  `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8000`, acesso por `localhost`).
- Referência "antes": `master @ eda7520`, mesmo procedimento em `:4382`.
- Os dois builds foram feitos a partir de `git archive` em diretório de rascunho (com `node_modules` por
  hard link), **não** dentro da worktree, para não disputar o `.next` com o `make verify` do QA.
- Fora do julgamento, por decisão do owner: a escala linear da liquidação e a janela de 7 dias em 1h/4h.
  A **contagem** da liquidação também fica fora, porque o coletor ainda não roda com a T-05.2. Aqui se
  julgam o layout e a forma do aviso.

## Evidência

`w7-screens/` tem 13 PNGs de página inteira, quantizados para 256 cores. A cor do chip foi conferida por
pixel: `(121,96,144)` no bruto e `(125,99,149)` no quantizado.
- `after-{1280,1024}-{1m,5m,15m,1h,4h}.png` são as 10 capturas da W7.
- `before-1280-{15m,1h,4h}.png` são as do master, e reproduzem a queixa do owner.

⚠️ **As capturas do owner (`…/images/1.png`, `2.png`, `3.png`) NÃO existem em disco**
`[MEDIDO: ls do diretório da sessão → só scratchpad/ e tasks/]`. Por isso a comparação foi feita contra o
master, que reproduz o que `handoff/FIX-uso-2026-10-02.md` descreve (D-A a D-D):
- velas de 1h e 4h aparecem só como pavio;
- caixas `COBERTURA PARCIAL — 96 de 96 buckets…` em cada perna;
- pane de liquidação espremido.

Fatos medidos por `page.evaluate` sobre `[data-pane-legend]` (n = 20 cargas, 2 builds × 2 viewports × 5 TFs)
`[MEDIDO 2026-10-02]`:

| legenda (altura em px) | master 1280 | W7 1280 | master 1024 | W7 1024 |
|---|---|---|---|---|
| Liquidações (5m–4h) | **126** | **58** | 126 | 78 |
| Preço+Volume (5m–4h) | 60 | 38 | 60 | 38 |
| CVD (5m–4h) | 62 | 38 | 62 | 38 |

Quantidade de barras por TF, contada pelo `sr-only` do chip ("em N de N barras"):

| TF | barras | janela |
|---|---|---|
| 5m | 1152 | 4 d |
| 15m | 384 | 4 d |
| 1h | **168** | 7 d |
| 4h | **42** | 7 d |

No master, o eixo de 4h tinha 24 velas perdidas em 5.760 slots de 1 minuto.

## O que a W7 resolve (verificado na tela)

1. **D-A, eixo por TF.** Em 1h e 4h as velas têm corpo, as de 4h com ~22 px a 1280. Em 1m e 15m a densidade
   está correta. O defeito "só pavio" sumiu nos 5 TFs e nos 2 viewports.
2. **D-C, aviso proporcional.** O chip inline `◇ cobertura parcial — faltam 1 h 5 min de 4 d (1.1%)` substitui
   a caixa com borda que ocupava uma linha inteira por pane. Em 1m o chip não aparece, e isso é o correto.
3. **C-3, forma compacta a 1024.** Aparece `◇ faltam 8 h 22 min (5.0%)` nos 4 TFs com chip. Os elementos
   protegidos continuam visíveis nos 5 TFs:
   - o selo `⚠️ Dado de TERCEIRO (coinalyze)`;
   - a nota `(escala linear)` do volume.
4. **C-2.** O texto longo está num nó `.sr-only` real (3 nós a 1024/1h), sem `title` nos chips
   `[MEDIDO: title=null nos 6 data-coverage-expected-ms]`.
5. **D-D, pane de liquidação.** A legenda encolheu de 126 para 58 px, e as barras voltaram a ser legíveis.

## Notas por domínio (`ux-ui-mastery:design-review`)

| domínio | nota | resumo |
|---|---|---|
| Heurísticas (Nielsen) | 8 | o estado do sistema ficou honesto e proporcional, e o ruído de alarme sumiu |
| Fundamento de pesquisa | 8 | parte da queixa literal do owner, com causa medida (D-A a D-D) |
| Mobile | 5 | fora do escopo declarado: o piso é 1024×768 (§10.4), e abaixo dele nada foi desenhado |
| Desktop | 8 | boa densidade, alvos dos botões de TF com 28×32 px, foco por Tab chega ao TF ativo |
| Visual | 8 | hierarquia limpa, a tinta `integrity-ink` só no chip, sem moldura |
| Acessibilidade | 7 | `sr-only` real, `aria-pressed` nos TFs, alvo ≥ 24 px (2.5.8); contraste não medido nesta rodada |
| Interação | 7 | troca de TF limpa; o ao vivo não foi medido (ver abaixo) |
| Prontidão futura | 6 | `data-fact` e `data-coverage-*` deixam a tela legível por máquina |
| Arquitetura de sistema | 8 | a forma do chip é escolhida por container query, o que bate com §10.2(d) |
| Ética e conteúdo | 9 | magnitude explícita, "não sabemos" separado de "zero", sem alarme falso |

**Ponderado: 80/100.**

## Condições NÃO bloqueantes

- **N-1 — regressão pequena, causada pela própria W7.** O rótulo `Últimas 4 h` do pane long/short passou a
  invadir a escala de preço ou a ser cortado:
  - a 4h aparece como `Última` (1280 e 1024);
  - a 1024/1h ele vai de x=909 a x=1000, com a borda do plot em 944.

  No master ele cabia (1088–1178 a 1280/4h), porque a faixa das últimas 4 h ocupava 60 slots de 1 minuto.
  Agora é uma vela só. Correção sugerida: limitar o rótulo à área do plot, ou ancorá-lo à esquerda da faixa.
  Evidência: `w7-screens/after-1280-4h.png` contra `before-1280-4h.png`.
- **N-2 — já existia.** Nos TFs 1h e 4h o cabeçalho diz `Preço (1m, USDT)`, `Volume (1m, BTC)` e
  `Liquidações (1m, USD)`. Essa é a grade nativa, mas lida ao lado do botão `1h` ativo ela confunde.
  Sugestão: `nativo 1m` ou `1h · nativo 1m`.
- **N-3 — depende da T-05.2.** Em 1m e 15m as fileiras de marca `ausente`/`zero` da liquidação ficam
  densas. A causa é o coletor sem T-05.2. Revalidar depois do deploy, sem julgar a contagem agora.
- **N-4 — já existia.** A página tem 1081 px de altura, então a 768 e 800 de viewport o CVD e o eixo de
  tempo ficam abaixo da dobra. É assim no master também.
- **N-5 — já existia.** A 1024/1h e 4h a legenda do OI quebra em 2 linhas (70 px), e a área de dado do OI
  cai para cerca de 60 px.

## Declarado, em vez de escondido

- `[NÃO MEDIDO]` Ao vivo: os dois builds mostram `ao vivo indisponível`. O console registra CORS para
  `http://127.0.0.1:8000/?series_key_id=…` a partir da origem `localhost`, 6 erros por carga, iguais no
  master e na W7. É um artefato deste ambiente de revisão, e não foi julgado.
- `[NÃO MEDIDO]` Contraste WCAG do chip (`integrity-ink` sobre o fundo): não foi medido nesta rodada.
- `[NÃO SEI]` Comparação direta com as capturas do owner: os arquivos não estão em disco.
- Os scripts de captura (`shoot.mjs`, `a11y.mjs`) ficaram no scratchpad da sessão e não são versionados.
  O procedimento está descrito no topo deste arquivo.
