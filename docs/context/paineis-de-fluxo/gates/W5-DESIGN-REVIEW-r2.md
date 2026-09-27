# `W5-DESIGN-REVIEW-r2`: veredito do `ux-ui-mastery` sobre o `/symbol` recapturado no HEAD da wave `paineis-f04`

**Veredito: APPROVED WITH CONDITIONS. Nota 65/100**, igual a `T-04.7` e ao `W5-DESIGN-REVIEW` (r1). Nenhum
achado de severidade ≥ 3 é atribuível à wave. Os 5 itens do falsificador de `T-04.7` §7 foram **medidos de novo, no
pixel do HEAD**, e nenhum dispara. Também medi o que o `W5-QA-FIX` mudou, o `RN-3` (o crosshair sobre a liquidação não
rotula o eixo), com controle positivo. Continuam abertas as condições SF-16, SF-17 e SF-18 de `T-04.7` §4 e a
OBS-W5-1 do r1, todas de sev. ≤ 2. **Seguem escalados**, e nenhum reprova o design: o E-7 (dado parado **há 6 h 02 min**)
e a metade Stitch do `CA-12`.

```
Feature: paineis-de-fluxo · Wave: W5 (wave/paineis-f04) · HEAD cd8969a · base de T-04.7: 0df6ded · referência master 613719a
Skill: ux-ui-mastery:design-review (10 domínios) · captura 2026-09-27 06:16–06:24 UTC · portas 8847 (proxy) / 4347 (app)
```

## 1. Por que recapturar em vez de reaproveitar

O r1 escreveu a condição da própria validade: *"perde a validade se `git diff --quiet 0df6ded HEAD -- frontend/`
deixar de dar `rc=0`"*. **Ela disparou**, e por isso este laudo recaptura e não relê.

| condição | comando | resultado |
|---|---|---|
| `frontend/src` mudou desde `T-04.7` | `git diff --quiet 0df6ded HEAD -- frontend/src` | **rc=1** `[MEDIDO]`. Mudou 1 arquivo, `frontend/src/app/symbol/unlabeled-tick-format.ts`, com +7 linhas **só de comentário** no docblock (o `W5-QA` W-b: *"defence in depth"*). Em `frontend/` também entrou `e2e/24` (+90/−4, do `96f5303`) |
| a cópia do app é o HEAD | `diff -r -q frontend/src <scratchpad>/w5dr2/app/src` | **rc=0**. `git rev-parse --short HEAD` = `cd8969a` |
| o dado real ainda está parado | `psql` com `PGOPTIONS='-c default_transaction_read_only=on'`: `max(bucket_end)` de `md.series` e as linhas da última hora | `2026-09-27 00:22:00Z` e **0** linhas, às 06:14Z e às 06:24Z `[MEDIDO]` |

A mudança é inerte por construção, porque é comentário. Mesmo assim, o despacho pede screenshot, e a regra é
*"recapturar, e não reler"*. Recapturei.

## 2. Instrumento

- **App:** `rsync` de `frontend/` para o scratchpad, com `node_modules` por hard link (`cp -al`), e depois
  `INGEST_HEALTH_API_BASE_URL=http://127.0.0.1:8847 npx next build` (**rc=0**) e `next start -H 127.0.0.1 -p 4347`.
- **Dado:** a API de produção `:8000`, lida pelo proxy só-GET de [`T-04.7-evidence/proxy.mjs.txt`](T-04.7-evidence/proxy.mjs.txt)
  com a porta trocada para 8847. Último contador: **`proxy_get_requests_total=376 refused=0`** `[MEDIDO]`. **Nenhum
  INSERT e nenhum seed.** O `psql` rodou só com `default_transaction_read_only=on`.
- **Captura:** os mesmos scripts de `T-04.7-evidence/` (`cap.mjs`, `cap2.mjs` sem o bloco (c), que foi descartado lá, e
  `cap3.mjs`), trocando só o caminho do Playwright e a porta. Saíram **28 PNGs** mais os JSONs, com digest
  `sha256sum *.png | sha256sum` = `5cb01b80fead866e`. Tudo ficou no scratchpad da sessão (`w5dr2/`).
- **Pixel:** `measure.py` e `v2r2.py` de `T-04.7-evidence/` e `validator-ink.py` de `T-04.4-evidence/`, **sem alteração**.
- **RN-3 (novo neste laudo):** a sonda do §3.3, reproduzida no fim deste arquivo.

## 3. O falsificador de `T-04.7` §7, medido no HEAD

### 3.1 Itens (1) a (4): nenhum dispara

| item | limiar | HEAD `cd8969a` (n = 11 recortes do pane, DPR 1) | T-04.7 |
|---|---|---|---|
| (1) SF-10: tinta de barra acima de `data-reserved-scale-top-px` | `> 0` reprova | **0** em 11/11 | 0 em 11/11 |
| (2) legenda: ≠ 2 leituras, ou numeral com sinal de menos | qualquer uma reprova | **2 leituras** em 120/120 posições de crosshair (24 × 5 TFs a 1920) e em 11/11 repousos. **0** sinal de menos. x do numeral = **312** nas duas pernas | igual |
| (3) F-6: última linha verde e 1ª vermelha | a mais de 1 px reprova | **147/148** (`1m`) e **171/172** (`5m`+), com um só valor por captura em 11/11 | igual |
| (4a) V-1 (piso cima/baixo) | `> 2,2×` reprova | DPR 1: **2,0×** em 9/9 de `1m`–`1h` (`4h`: 1,57×). DPR 2: **1,94×** (`1m`) e **1,64×** (`15m`) | idêntico |
| (4b) F-1 a `1m` | `< 4×` reprova | cima **6,5×** (1280) / **11,5×** (1920). Baixo **53×** / **53×** | idêntico |

Também sem disparo: **F-3** = 0 px de marca na região de barras e 0 px de barra nas faixas de marca, em 11/11. **V-3** =
100 % das colunas sem barra com a linha do zero desenhada (de 975/975 a 1838/1838). A chave cabe inteira
(`scrollWidth = clientWidth = 798`). SF-8 (`floatNoise`) = 0 e SF-9 (`SEM_PONTO` no `sr-only` e visível) = 0, em 11/11.
`log10`/"ordem de grandeza" no pane = 0. `document.scrollWidth` = largura do viewport nos 3 viewports, sem rolagem
horizontal. As respostas ≥ 400 são **15/3/15** por viewport, iguais às de `T-04.7` (o E-2 do ao vivo).

**V-2** (≥ 64 % dos pares com razão desenhada ≥ 1,5×): **6/7 = 86 %**, contra **1/7** do modelo log `[MEDIDO:
v2r2.py]`. **Passa.** Os pares não são os de `T-04.7` (9/10), porque a janela andou. O motivo está no §4.

### 3.2 Item (5), SF-11 (clique de TF sem estado pendente)

`first_pressed_ms` com poll por `requestAnimationFrame` (`cap2.mjs` (b), n=6): 4006, 3740, 4011, 3992, 3876 e 4307, com
**mediana 3999 ms** e `aria-busy` = 0. O HEAD de `T-04.7` deu 3947 e o `master` 4118. O item (5) só vale *"com o dado de
volta"*, e o dado não voltou. Mesmo assim, o HEAD **não passa** do `master`. **Sem disparo, e com a ressalva.**

### 3.3 RN-3 no pixel: o que o `W5-QA-FIX` protege

A `1920×1080`, a `1m` e a `15m`, pus o ponteiro **dentro** do pane da liquidação, a 72 % (metade de cima, a do short) e a
90 % (a de baixo, a do long) da altura da linha. Depois recortei a célula do eixo direito dessa linha e comparei com o
recorte em repouso.

| caso | diferença na célula do eixo (px com Δ > 24) |
|---|---|
| liquidação `1m`: cima / baixo | **0 / 0** (`getbbox() = None`) |
| liquidação `15m`: cima / baixo | **0 / 0** |
| **controle positivo**: a mesma sonda no pane de preço, `1m` e `15m`, cima e baixo | **318, 401, 325 e 358** |

A legenda da liquidação mudou sob o ponteiro, de `ausente` para `290054.6 · 0` (`1m`) e `115902.4398 · 0` (`15m`). Isso
prova que o crosshair estava **ativo** no pane. O controle prova que o instrumento **vê** um rótulo de crosshair quando
ele existe. **O eixo da liquidação não rotula, e nenhum número negativo aparece nele.**

## 4. O que mudou entre `T-04.7` e o HEAD, e por que não é do código

- **Os 5 recortes a 1920 e os de `4h` deram fatos idênticos** aos de `T-04.7` em todas as chaves de `measure.py`: 6 de
  11 idênticos. Os PNGs **não** são byte a byte iguais (4 de 28), porque o texto de idade (*"5 h 34 min"*), o `T` e o eixo
  de tempo andam com o relógio.
- **A 1280, a janela desliza com o relógio, com o dado parado.** `data-liquidation-present-points` do short passou de
  819 para 782 e o do long de 816 para 779. O número de colunas com barra caiu de 157 para 145 (short, `1m`). No recorte
  `1280x800-1m-liq`, a cascata de long (o exemplo visível do F-1 53×) está agora em x ≈ 3, **na borda esquerda**.
  `[INFERRED: pelo ritmo de ≈ 37 pontos em ≈ 1 h 40 min, ela sai da janela de 1280 na próxima hora]`. A `1h`/1280, a
  maior barra de short já saiu, e o F-1 de cima caiu de 12,0× para 4,0×. **Isso não é regressão.** O F-1 do falsificador
  é medido a `1m`, onde continua em 6,5×/53×. É uma consequência do E-7: **enquanto o dado não voltar, cada recaptura mede
  uma janela mais vazia**, e um gate futuro não pode ler essa queda como defeito do front.

## 5. Condições abertas (nenhuma reprova)

Revi com os próprios olhos `1920x1080-15m` (a tela inteira), `1280x800-1m-liq` e `1280x1200-1m-crosshair-55`.

- **SF-16 (sev. 2) continua aberto.** O numeral cru segue sob o crosshair: `115902.4398`, `290054.6`.
- **SF-17 (sev. 1)** fica igual. O x do numeral não mudou.
- **SF-18 (sev. 2) continua aberto.** A `15m`, os dois selos dizem *"384 de 384"* e o do volume diz **149** de 384.
  Era 143 em `T-04.7`, o que também é efeito da janela deslizante.
- **OBS-W5-1 (sev. 1) continua aberta.** A 1280, a nota termina em *"…medir a fidelidade contra, e pub…"*.
- **SF-6 continua visível a 1280.** A caixa *"Últimas 4 h"* cobre o fim da linha de proveniência do long/short
  (*"…binance · nat[iva]…"*). Segue **não comparável** pelo E-7.

## 6. Pontuação, pelos 10 domínios da skill

| domínio | nota | força principal | melhoria principal |
|---|---|---|---|
| Heuristic Compliance | 7 | H4: a liquidação usa a gramática do volume (linear, base 0, marcas de ausente e zero) | H2: numeral cru de 8 dígitos (SF-16) |
| Research Foundation | 7 | 5 falsificadores mais o RN-3, medidos no pixel real, e o RN-3 com controle positivo | nenhum teste com operador. `F-4` `[NÃO MEDIDO]` |
| Mobile Experience | 3 | — | fora do alvo (desktop de operador) |
| Desktop Experience | 7 | um pane, uma linha de zero, os dois lados num olhar. A 800 px o pane cabe na 1ª vista | a `5m`+ a legenda ocupa 60 % do pane (SF-18) |
| Visual Design | 7 | tokens de alta e baixa, SF-10 fechado, eixo mudo na liquidação | SF-17, OBS-W5-1 e a caixa "Últimas 4 h" sobre o texto a 1280 |
| Accessibility | 7 | a perna se lê pela posição, pela palavra e pela forma do quadrado, não só pela cor (WCAG 1.4.1) | o `sr-only` "Leitura atual: ausente" diverge do numeral a `4h` |
| Interaction Design | 6 | crosshair coerente: 2 leituras em 120/120 posições, x estável, eixo sem rótulo falso | SF-11 (≈ 4 s sem estado pendente, mediana 3999 ms) e SF-12 |
| Future-Readiness | 6 | os `data-liquidation-*` deixam lado, escala e zero legíveis por máquina | sem mudança |
| System Architecture | 8 | o registry funde duas coortes sem número com sinal no caminho. O formato de tick virou defesa em profundidade, com guarda de pixel (`e2e/24` RN-3) | E-3/E-5: grade de 1 min em TF ≠ `1m` |
| Ethics & Content | 7 | nenhum número líquido e nenhuma magnitude com sinal. Ausente ≠ zero por perna | o selo "384 de 384" repetido e suspeito (SF-18) |

**Média: 65/100** `[MEDIDO: 7+7+3+7+7+7+6+6+8+7 = 65]`. Radar: `[7, 7, 3, 7, 7, 7, 6, 6, 8, 7]`. Nenhuma nota mudou
em relação a `T-04.7`/r1. A única mudança de `frontend/src` é um comentário, e o pixel medido confirma isso.

**Top 3 forças:** (1) *"qual lado foi varrido"* se lê de relance, com a cascata de long a 53× a mediana, embaixo e em
vermelho. (2) Não há caminho visual para um número líquido ou com sinal: nem na legenda (0 sinal de menos em 120
posições) nem no eixo (0 px de rótulo sob o crosshair). (3) O SF-10, o defeito visual mais antigo da liquidação,
continua fechado.

**Roteiro.** *Rápido (< 1 dia):* SF-16 (formatador pt-BR, com o passo pela magnitude), SF-17 (coluna numérica alinhada à
direita) e OBS-W5-1 (a justificativa vai para `title`/`details`). *Médio (1–5 dias):* SF-18 (um selo por pane, depois de
conferir a contagem), o `sr-only` coerente com o numeral e a caixa "Últimas 4 h" sem cobrir texto. *Estratégico:*
E-3/E-5 (largura da barra e título em TF ≠ `1m`).

## 7. Escalado, e não atribuído à wave

- **E-7 continua.** `max(bucket_end)` = 00:22Z às 06:24Z, ou seja, **6 h 02 min** sem bucket novo `[MEDIDO: psql só
  leitura]`. `[NÃO MEDIDO: causa]`. Dono: `infra`. A consequência nova é a do §4: a janela esvazia a cada recaptura.
- **`CA-12`, a metade Stitch.** Este laudo cobre só o screenshot. Dono: o orquestrador.
- DPR 1,5, ETHUSDT e `F-4`: `[NÃO MEDIDO]`, como em `T-04.7`.

## 8. Falsificador deste veredito

Valem os itens (1) a (5) de `T-04.7` §7, com os mesmos instrumentos, e somo um sexto: **(6) qualquer px com Δ > 24 na
célula do eixo da liquidação sob o ponteiro dentro do pane, enquanto o controle no pane de preço continua > 0**. Este
laudo também perde a validade se `git diff --quiet cd8969a HEAD -- frontend/src` deixar de dar `rc=0` antes do merge.

A sonda do §3.3 (`rn3.mjs`). O controle é o mesmo arquivo com `liquidation-pane` trocado por `price-pane`:

```js
import { chromium } from "<worktree>/frontend/node_modules/playwright/index.mjs";
import fs from "node:fs";
const OUT = process.argv[2]; const res = {}; const browser = await chromium.launch();
for (const tf of ["1m", "15m"]) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:4347/symbol/BTCUSDT?interval=${tf}`, { waitUntil: "load", timeout: 180000 });
  await page.locator(".tv-lightweight-charts").first().waitFor({ timeout: 180000 }); await page.waitForTimeout(6000);
  const g = await page.evaluate(() => { const tr = document.querySelector('[data-testid="liquidation-pane"]').closest("tr");
    const r = tr.getBoundingClientRect(); const c = tr.lastElementChild.getBoundingClientRect(); return { top: r.top, h: r.height, ax: c.left, aw: c.width }; });
  const clip = { x: g.ax, y: g.top, width: g.aw, height: g.h };
  await page.mouse.move(2, 2); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/rn3-${tf}-rest.png`, clip });
  for (const [name, fy] of [["upper", 0.72], ["lower", 0.9]]) {
    await page.mouse.move(g.ax * 0.3, g.top + g.h * fy); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/rn3-${tf}-${name}.png`, clip });
    res[`${tf}-${name}`] = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="liquidation-pane"] [data-legend-value]')).map((e) => e.textContent.trim()));
  }
  await page.close();
}
await browser.close(); fs.writeFileSync(`${OUT}/rn3-facts.json`, JSON.stringify(res));
// then: PIL ImageChops.difference(rest, hovered) -> getbbox() and count of L-channel px > 24
```
