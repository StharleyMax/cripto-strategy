# W4-DESIGN-REVIEW r2: `ux-ui-mastery:design-review` da wave W4 depois do `W4-QA-fix`, sobre o `/symbol` real

**Feature:** `paineis-de-fluxo` · **Base:** `2b1b2f4` (`wave/paineis-f02`) · **Data:** 2026-09-26 (T da tela =
23:44 UTC) · **Skill:** `ux-ui-mastery:design-review` (10 domínios) · **Portas:** 8847 (proxy) / 4347
(`next start`) · **Não gravei `gate-record`** (regra §4). Rodada anterior: [`W4-DESIGN-REVIEW.md`](W4-DESIGN-REVIEW.md).

## 0. Veredito: APPROVED. Nota 63/100 (igual à r1)

O `W4-QA-fix` não mexeu em nada que se vê. Todos os números da r1 se repetem no HEAD novo, medidos pelo mesmo
instrumento:

1. **`MF-1` continua fechado.** `fused_same_hue_cols` = **0 em 8/8** capturas e `gap0_cols` = **0 em 8/8**.
2. **SF-8 e SF-9 continuam fechados.** `floatNoise` = `[]` e `srOnlySemPonto` = 0 em 4 viewports × 5 TFs.
3. **O teclado segue o padrão APG de toolbar:** uma parada no `Tab`, e as setas movem o foco com volta circular.

**Uma correção de instrumento, e ela vale também para a r1.** A r1 contou a captura 1920×1080 `1m` como "0" de
fusão. Esse 0 era **vazio**: o `band.py` lê a linha 385, e a 1920 em `1m` a base da barra fica na linha **384**.
Por isso ele achava **0 colunas de barra** (`bar_cols` = 0 na r1 e na r2). Medido de novo com a base em 384, dá
**1151 colunas de barra e 0 fundidas** (§2). A conclusão da r1 sobrevive, mas o "8/8" dela só era 7/8 medido.

**Nenhum achado novo.** O SF-15 (barra cinza sem chave de cor) continua aberto. O `W4-QA-fix` fechou a outra metade
dele: os documentos agora dizem "doji = neutro", como a tela. Mas a tela ainda não diz o que o cinza significa.

## 1. Instrumento

| item | como |
|---|---|
| reaproveitar? | **Não.** `git diff --stat 5774cf9 HEAD -- frontend/` mostra **1 arquivo, +2/−1**: `SymbolClient.tsx:1728`, que é docstring (`SEM_PONTO` → `ABSENCE_TOKEN`). Isso não pode mudar pixel. Mesmo assim a condição do despacho ("se `frontend/src` não mudou") é falsa, então capturei de novo |
| dado | proxy **só-GET** `:8847 → :8000` (modelo `T-01.11-r2-proxy.mjs.txt`). No fim deu **148 GETs e 0 recusas** (`proxy.log`). Nenhum INSERT e nenhum seed |
| app | cópia nova de `frontend/` no scratchpad (`diff -r -q frontend/src app/src` → idêntico), `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847 next build` (rc=0) e `next start -H 127.0.0.1 -p 4347` |
| captura | o mesmo `cap.mjs` da r1 (`T-02.5-evidence/cap.mjs.txt` + viewport 390×844 + sonda de a11y), rc=0: 13 PNGs e `W4r2-facts.json`. Mais o `kbd.mjs` |
| pixel | `band.py`/`gap.py` da r1 sem alteração, com o limite x na borda do plot (1108 a 1280, 1748 a 1920). Para a 1920 `1m`, uma cópia com `BASE = 384` (`band384.py`/`gap384.py`, só essa constante trocada) |
| onde está | scratchpad `…/scratchpad/w4r2/` (não versionado: a regra §4 manda commitar só o laudo) |

## 2. O que tinha de se manter, item a item

| item | r1 | r2 | resultado |
|---|---|---|---|
| `MF-1` fusão (`band.py`) | 0 em 8 | 1280×800 **0**, 1280×1200 **0**, zoom **0**, 1920 `1m` **0** (base 384: 1151 colunas medidas), `5m`/`15m`/`1h`/`4h` **0/0/0/0** | **mantido** |
| `gap0_cols` (`gap.py`) | 0 em 8 | **0 em 8** | **mantido** |
| piso da vela (linhas 130–328) | 321 / 328 a 1920 | **321** em 1280 `1m`, zoom, `5m`, `15m`, `1h`, `4h`. **328** a 1920 `1m`, só na coluna x=728: tinta contínua de 328 a 384, então é o topo da barra do pico e não vela (a r1 viu o mesmo em x=746, e o dado andou) | **mantido** |
| F-2 (ponte barra ↔ faixa de marcas) | 0 em 8 | **0 em 8** | **mantido** |
| F-3 (o pico salta) | 28,5 / 9,5 / 19,0 / 14,2 / 7,1 / 5,0 | 28,5 (`1m`), 11,4 (zoom), **28,0** (1920 `1m`, antes não medido), 19,0, 14,2, 7,1, 5,0 | **mantido** (≥ 4× em todo TF) |
| direção em `1m` a 1280 | 476 alta / 437 baixa / 99 neutras | **478 / 454 / 98** (o dado andou) | lê-se de relance |
| SF-8 / SF-9 | fechados | `floatNoise` = `[]`, `srOnlySemPonto` = 0, `visibleSemPonto` = 0 nos 4 viewports e nos 4 TFs a 1920 | **fechados** |
| teclado | passa | `Tab` → `1m`. `→ →` vai a `15m`, `End` a `4h`, `Home` a `1m`, e `←` volta circular a `4h`. `:focus-visible` em todos, contorno sólido de 2 px `[MEDIDO: kbd.json]` | **passa** |
| contraste / alvos / estrutura | passa | `low_contrast_n` = **0** nos 4 viewports (a sonda não enxerga texto sobre canvas: é piso, não prova). 6 alvos ≥ 24 px, `lang="pt-BR"`, 1 `h1`, 2 landmarks | **passa**, com esse limite |
| scroll horizontal | nenhum | `sw` = `cw` nos 4 viewports (390 = 390) | ok |

**As 70 colunas de "vela na faixa" do `gap384.py` a 1920 `1m` são artefato do instrumento, não achado.** Li a coluna
x=1 inteira: um trecho G de 340 a 367 e depois um trecho R de 368 a 384, sem fundo entre os dois. São **duas barras
vizinhas** que dividem uma coluna de pixel, porque a 1920 `1m` sai ~1,2 px por barra. Nenhuma coluna tem tinta de
direção entre 322 e 328, fora a do pico. `min_gap_rows` = 1 e `gap0_cols` = 0.

## 3. Condições herdadas (conferidas nos PNGs da r2)

Nenhuma piorou e nenhuma fechou: **SF-6** ("Últ…" cortado pelo eixo, visível a 1280 e a 1920), **SF-10** (barras
de liquidação atravessam a caixa "COBERTURA PARCIAL" em `15m`), **SF-13** (chave das marcas só no `sr-only`),
**SF-14** (deuteranopia, sem medir de novo), **E-2** (*"ao vivo indisponível"* ×3, maior que o corpo da legenda),
**E-3** (vela de 1 px em `4h`), **E-4** (`DADO VELHO` = 1 em `1h` e 1 em `4h`, 0 nos outros), **E-5** (título
"(1m, …)" em `15m`) e mobile (12 nós truncados, os mesmos nos 4 viewports).

**SF-15 (sev. 2) continua aberto, mas pela metade.** `grep -oiE 'cinza|neutr[oa]|sem dire[cç][aã]o|doji'` em
`W4r2-facts.json` devolve **0 ocorrências**: a tela não diz o que é a barra cinza, nem visível nem `sr-only`. O
`W4-QA-fix` (`274bd1f`) alinhou os documentos à tela (doji = neutro), então já não há duas regras em disputa. A
recomendação da r1 continua de pé: uma linha `▮ alta · ▮ baixa · ▮ sem direção (fechamento = abertura)` na legenda
do volume. Ela também fecharia o SF-13.

## 4. Pontuação, pelos 10 domínios da skill

| domínio | r1 | r2 | uma linha |
|---|---|---|---|
| Heuristic Compliance | 7 | 7 | Pico e mínima se leem de relance. Legenda sem ruído numérico. O cinza sem chave pesa em H6/H10 (SF-15) |
| Research Foundation | 7 | 7 | Todo número vem de instrumento rodado de novo, e a rodada achou um furo no próprio instrumento (§0) |
| Mobile Experience | 3 | 3 | Fora do alvo. Sem scroll horizontal, legendas truncadas |
| Desktop Experience | 7 | 7 | Densidade alta com hierarquia estável, e o TF inteiro fica no teclado |
| Visual Design | 6 | 6 | Uma gramática de cor só. E-2 inverte a hierarquia, e o SF-10 continua |
| Accessibility | 6 | 6 | Roving tabindex, foco visível, alvos ≥ 24 px, `sr-only` diz `ausente`. SF-13/14/15 abertos |
| Interaction Design | 6 | 6 | Sem mudança |
| Future-Readiness | 6 | 6 | Sem mudança |
| System Architecture | 8 | 8 | Regra de direção isolada em `volume-direction.ts`, e a cor sai dos tokens |
| Ethics & Content | 7 | 7 | O doji não inventa direção, e agora os documentos dizem o mesmo que a tela |

**Média: 63/100** `[MEDIDO: 7+7+3+7+6+6+6+6+8+7 = 63]`. Radar: `[7, 7, 3, 7, 6, 6, 6, 6, 8, 7]`.

**Pontos fortes:** (1) o `MF-1` agora está medido em 8/8 de verdade, incluindo a captura que a r1 media vazia.
(2) SF-8 e SF-9 continuam fechados na tela. (3) O teclado segue o padrão APG.

**Roteiro** (o mesmo da r1). *Rápido (< 1 dia):* SF-15 junto com SF-13 (uma linha visível de chave de cor e de
marcas) e E-2. *Médio (1–5 dias):* SF-6, SF-10, SF-14, E-4, E-5. *Estratégico:* E-3 (`ADR-044`).

## 5. Falsificador deste veredito

O APPROVED cai se alguma destas coisas acontecer:

- `fused_same_hue_cols > 0` numa das 8 capturas, com a 1920 `1m` medida na base **384** e as outras na 385;
- `bar_cols` = 0 numa captura de `1m`. Isso não é "0 de fusão": é o instrumento lendo a linha errada;
- tinta G/R entre as linhas 322 e 328 que não seja contínua até a base;
- `floatNoise` não vazio, ou `srOnlySemPonto` > 0;
- o `Tab` parar em mais de um botão de TF.

Hoje o resultado é 0/8 (com 1151 colunas medidas a 1920 `1m`), 321, `[]`/0 e uma parada com setas.
