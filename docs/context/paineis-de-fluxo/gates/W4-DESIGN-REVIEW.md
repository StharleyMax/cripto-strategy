# W4-DESIGN-REVIEW: `ux-ui-mastery:design-review` da wave W4 (fase 02 + T-01.R1) sobre o `/symbol` real

**Feature:** `paineis-de-fluxo` · **Base:** `c0d851b` (`wave/paineis-f02`) · **Data:** 2026-09-26 (UTC ~23:09) ·
**Skill:** `ux-ui-mastery:design-review` (10 domínios) · **Portas:** 8847 (proxy) / 4347 (`next start`) ·
**Não gravei `gate-record`** (regra §4).

## 0. Veredito: APPROVED. Nota 63/100 (igual à `T-02.5` r2)

A wave não quebrou nada que a `T-02.5` r2 aprovou, e os dois consertos do `T-01.R1` aparecem na tela:

1. **O `MF-1` continua fechado no HEAD integrado.** `band.py` dá `fused_same_hue_cols` = **0 em 8/8** capturas.
   O piso da vela fica na linha **321** em zoom, `5m`, `15m`, `1h` e `4h` (a teoria dá 322). O F-3 fica em
   28,5× / 19,0× / 14,2× / 7,1× / 5,0× (`1m`/`5m`/`15m`/`1h`/`4h`), os mesmos números da r2 (§2).
2. **SF-8 fechado:** nenhum numeral com ruído de ponto flutuante (`/\d+\.\d{7,}/`) em 4 viewports × 5 TFs. A r3
   da W1 via `613372.7679000001`, e agora a liquidação lê `505.5298` em `15m`.
3. **SF-9 fechado:** **0** nós `sr-only` com `SEM_PONTO`, e a leitura diz `Leitura atual: ausente`.
4. **A direção do volume se lê de relance.** Em `1m` a 1280 são 476 colunas de alta, 437 de baixa e 99 neutras. O
   doji sai **neutro** (`#8b949e`), como decidiu `ADR-010/D-2`.

**Um should-fix novo, e ele não reprova:** a tela não tem chave de cor, nem visível nem `sr-only`, que diga o que
significa a barra **cinza** (SF-15, §4). Ele encosta no BLOCKER-1 do `W4-QA` (3 documentos ainda dizem "doji =
alta"). O conserto é de documento e não é tarefa de design, mas hoje o operador não tem como descobrir pela tela qual
das duas regras vale.

## 1. Instrumento

| item | como |
|---|---|
| reaproveitar? | `git diff --quiet 55c6eb8 HEAD -- frontend/src` → rc=0, então o front é **idêntico** ao que a r2 aprovou. Mesmo assim capturei de novo, porque os PNGs da r2 não foram versionados e porque a W4 é portão da wave inteira, não da `T-02.5` |
| dado | proxy **só-GET** `:8847 → :8000` (modelo `T-01.11-r2-proxy.mjs.txt`, com a porta como argumento). No fim deu **148 GETs e 0 recusas** (`proxy.log`). Nenhum INSERT e nenhum seed |
| app | cópia de `frontend/` no meu scratchpad (`diff -r -q src` = igual), com `node_modules` em hard link. `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847 next build` (rc=0) e `next start -H 127.0.0.1 -p 4347` com a mesma variável |
| captura | `T-02.5-evidence/cap.mjs.txt` com duas adições minhas: o viewport **390×844** e uma sonda de a11y (contraste por nó-folha, alvos de toque, 10 `Tab`, `lang`/landmarks). São 13 PNGs e `W4-facts.json`. Também rodei `kbd.mjs` (roving: `Tab`, `→ → End Home ←`) |
| pixel | `T-02.5-evidence/band.py.txt` e `r2-gap.py.txt` **sem alteração**, com o limite x na **borda do plot** (1108/1128 a 1280 e 1745–1747 a 1920), como pede o O-5 da r2 |
| onde está | scratchpad `…/scratchpad/w4/` (não versionado, porque a regra §4 manda commitar só o laudo) |

## 2. O que a W4 tinha de manter e de entregar, item a item

| item | medido | resultado |
|---|---|---|
| `MF-1`: vela e barra não se fundem | `band.py` `fused_same_hue_cols`: 1280×800 `1m` **0**, 1280×1200 `1m` **0**, zoom **0**, 1920 `1m` **0**, `5m`/`15m`/`1h`/`4h` **0/0/0/0**. `gap.py` `gap0_cols` = **0** nas 8 `[MEDIDO: band.json, gap.json; n=8 PNGs]` | **mantido** |
| piso da vela | `gap.py` `lowest_candle_row` = **321** em zoom/`5m`/`15m`/`1h`/`4h`. Nos PNGs de `1m`, restritos às linhas 130–328 (mesma regra da r2): **321** a 1280 e **328** a 1920. O 328 fica na coluna x=746, com tinta **contínua** de 328 a 384 e 28 linhas vazias acima. É o topo da barra do pico (antialias uma linha acima de 329), não vela `[MEDIDO: dump da coluna 746]` | **mantido** |
| F-2 (barra sem ponte com a faixa de marcas) | `F2_contiguous_cols` = **0** em 8/8 | **mantido** |
| F-3 (o pico salta) | 28,5× (`1m`), 9,5× (zoom: outro instante do dado, e o teto é ≥ 4×), 19,0×, 14,2×, 7,1×, 5,0× | **mantido** (≥ 4× em todo TF) |
| SF-8 (ruído de ponto flutuante) | `floatNoise` = `[]` em 4 viewports e nos 4 TFs a 1920 | **fechado** |
| SF-9 (`sr-only` dizia `SEM_PONTO`) | `srOnlySemPonto` = 0 e `visibleSemPonto` = 0 em todos. O `sr-only` diz `Leitura atual: ausente` | **fechado** |
| legenda × crosshair | varredura de 24 x a 1920: volume `ausente` 8/10/9/6/0 contra preço `ausente` 7/9/8/3/0 (`1m`/`5m`/`15m`/`1h`/`4h`). A diferença é de 1–3, na mesma faixa da W1-DR3 §1b ("preço `ausente` + 0–2"). ⚠️ Em `1h` a diferença é 3, uma acima dessa faixa. Não li slot a slot, e isso é do QA (`W4-QA` §2, 123/123) `[NÃO SEI se é lacuna real]` | sem regressão visível |
| teclado | `Tab` para uma vez no grupo de TF e `→`/`←`/`Home`/`End` movem o foco com `:focus-visible` e contorno sólido de 2 px, com volta circular (`←` em `1m` vai para `4h`). O `Tab` seguinte vai ao link de atribuição `[MEDIDO: kbd.mjs, W4-facts.tab_stops]` | **passa** (padrão APG de toolbar) |
| contraste do texto | a sonda achou **0** nós-folha visíveis abaixo de 4,5:1 (ou de 3:1 a partir de 24 px) nos 4 viewports. ⚠️ A sonda lê a cor de fundo do ancestral e não enxerga texto sobre canvas nem alpha composto, então é piso e não prova | **passa**, com esse limite |
| alvos | TF 32×28 e 39×28 px, acima de 24×24 (WCAG 2.2 AA, 2.5.8) | **passa** |
| `lang` / estrutura | `lang="pt-BR"`, 1 `h1` (`sr-only`), 2 landmarks | ok |

## 3. Condições herdadas: nenhuma piorou, e nenhuma fechou nesta wave

| item | agora |
|---|---|
| SF-6: caixa "Última…" do long/short cortada pelo eixo | igual. `Últ`/`Última` aparece cortada a 1920 e a 1280, em `1m` e em `15m` |
| SF-10: barras de liquidação sobre a legenda e sobre a caixa "COBERTURA PARCIAL" | igual (PNG `15m` e `4h`: as barras long atravessam a caixa) |
| SF-13: a chave das marcas do volume é `sr-only` | igual (o `marksLegend` existe, mas só no `sr-only`) |
| SF-14: sob deuteranopia, alta e neutro ficam com a mesma tinta | igual, sem medir de novo |
| E-2: 404 do ao vivo | **3** respostas ≥ 400 por viewport e *"ao vivo indisponível"* ×3, com tipografia **maior** que a do resto da página. A hierarquia inverte: o aviso de ausência pesa mais que o dado |
| E-3: vela de 1 px em `4h` | igual: traços de 1 px a ~120 px. O eixo único põe a barra de `4h` num slot de `1m` (`ADR-044`, estratégico) |
| E-4: "DADO VELHO" falso em TF ≠ `1m` | 1 em `1h` e 1 em `4h`, 0 nos outros (*"há 3 h 54 min … DADO VELHO"* no OI de `4h`) |
| E-5: título "(1m, …)" em todo TF | igual: `(1m, USDT)`/`(1m, BTC)`/`(1m, USD)` em `5m`–`4h` |
| mobile (390×844) | fora do alvo. Sem scroll horizontal (`sw 390 = cw 390`). As legendas truncam com reticências (12 nós truncados, os mesmos nos 4 viewports) e o OI quebra em 4 linhas |

## 4. Achado novo

- **SF-15 (sev. 2; H6 reconhecimento, H10 ajuda): a cor da barra de volume não tem chave.** Verde e vermelho seguem
  a convenção de plataforma (H4), e isso se lê sem ajuda. O **cinza** (99 colunas em `1m` a 1280) não segue
  convenção nenhuma: algumas plataformas pintam o doji como alta e outras pela vela anterior. Grepei a microcopy de
  `SymbolClient.tsx` e de `pane-legend.ts` (`cinza|neutr|doji|alta|baixa|verde|vermelh`) e só achei comentário de
  código. Não há texto visível e nem `sr-only`. Com o BLOCKER-1 do `W4-QA` (os documentos dizem "doji = alta"), o
  operador vê cinza e não tem na tela como saber qual regra vale. **Recomendação** (decisão do `ui-designer`): uma
  linha na legenda do volume, perto de *"Altura da barra proporcional…"*, no formato `▮ alta · ▮ baixa · ▮ sem
  direção (fechamento = abertura)`. Visível, ela também fecha o SF-13 e cumpre a WCAG 1.4.1 sem depender da vela
  acima. **Não reprova:** a cor é redundante com a vela logo acima, e a direção de 123/123 barras está certa
  (`W4-QA` §0).

## 5. Pontuação, pelos 10 domínios da skill

| domínio | r2 T-02.5 | W4 | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | 7 | O pico e a mínima se leem de relance. A legenda fala sem ruído numérico (SF-8). O cinza sem chave pesa em H6/H10 (SF-15) |
| Research Foundation | 7 | 7 | Todo número daqui vem de instrumento versionado e rodado de novo no HEAD integrado, e não do relatório |
| Mobile Experience | 3 | 3 | Fora do alvo. Sem scroll horizontal, legendas truncadas |
| Desktop Experience | 7 | 7 | Densidade alta com hierarquia de painéis estável, e o TF inteiro fica no teclado |
| Visual Design | 6 | 6 | Uma gramática de cor só. O "ao vivo indisponível" grande inverte a hierarquia (E-2) e o SF-10 continua |
| Accessibility | 6 | 6 | Roving tabindex correto, foco visível, alvos ≥ 24 px, `sr-only` agora diz `ausente` (SF-9). SF-13, SF-14 e SF-15 abertos |
| Interaction Design | 6 | 6 | Sem mudança |
| Future-Readiness | 6 | 6 | Sem mudança |
| System Architecture | 8 | 8 | `volume-direction.ts` isola a regra de direção num módulo testado, e a cor sai dos tokens (`#089981`/`#f23645`/`#8b949e`) |
| Ethics & Content | 7 | 7 | O doji não inventa direção que o dado não tem (`RN-4`). `ausente`/`retido`/terceiro continuam honestos |

**Média: 63/100** `[MEDIDO: 7+7+3+7+6+6+6+6+8+7 = 63]`. Sem o Mobile, **6,67** (60/9).
Radar, na ordem da tabela: `[7, 7, 3, 7, 6, 6, 6, 6, 8, 7]`.

**Pontos fortes:** (1) o `MF-1` sobreviveu à integração, com 0/8 medidos pelo mesmo instrumento que o reprovou.
(2) O `T-01.R1` entrega na tela o que prometeu: 0 ruído de ponto flutuante e 0 `SEM_PONTO`. (3) O teclado segue
o padrão APG, com uma parada no `Tab` e setas dentro do grupo.

**Roteiro.** *Rápido (< 1 dia):* SF-15 com SF-13 (uma linha visível de chave de cor e de marcas) e o peso
tipográfico do "ao vivo indisponível" (E-2, igualar ao corpo da legenda). *Médio (1–5 dias):* SF-6, SF-10, SF-14,
E-4, E-5. *Estratégico:* E-3 (largura da vela proporcional à duração, `ADR-044`).

## 6. Falsificador deste veredito

O APPROVED cai se alguma destas coisas acontecer:

- o `band.py` der `fused_same_hue_cols > 0` numa das 8 capturas do `cap.mjs`, com o limite na borda do plot;
- o `gap.py` achar tinta de vela abaixo da linha 322 em zoom ou em TF ≠ `1m`;
- `floatNoise` ficar não vazio, ou `srOnlySemPonto` > 0, em qualquer viewport ou TF;
- o `Tab` parar em mais de um botão de TF, ou as setas não moverem o foco.

Hoje o resultado é 0/8, 321, `[]`/0 e uma parada com setas. Qualquer mudança em `frontend/src` depois de
`c0d851b` invalida o "idêntico à r2" do §1, e aí a captura tem de ser refeita.
