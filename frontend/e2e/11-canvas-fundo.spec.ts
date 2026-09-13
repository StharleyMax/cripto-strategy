import { expect, test } from "@playwright/test";

import { SURFACE_BASE } from "../src/charts/color-tokens.ts";
import { fact } from "./helpers.ts";

/**
 * `DR-1` de [`gates/design-review-painel-cvd.md`] — **o único instrumento desta correção que mede
 * o que foi PINTADO, e não o que foi ESCRITO.**
 *
 * ── O DEFEITO, COMO ELE PASSOU ───────────────────────────────────────────────────────────────
 *
 * Em `74d59a4`, `SymbolClient.tsx:178-182` chamava `createChart` com `width`, `height` e
 * `timeScale` e mais nada ⇒ o `<canvas>` ficava no default publicado da biblioteca,
 * `background {type:"solid", color:"#FFFFFF"}`, dentro de uma página `#131722`. A linha de delta
 * do CVD (`provenanceStrong`, `#e6e9ef`) media **14,72:1 no portão e 1,22:1 na tela**
 * `[MEDIDO 2026-09-12, design-review, n=5 papéis de cor]`. Os seis portões de `make verify`
 * ficaram verdes o tempo todo — é o `rc=0` que `ADR-012` nomeia: indistinguível entre "nada
 * erodiu" e "o instrumento mede a referência errada".
 *
 * ── POR QUE ESTE ARQUIVO EXISTE AO LADO DOS OUTROS DOIS ──────────────────────────────────────
 *
 * A correção tem três instrumentos, e nenhum é substituto do outro:
 *
 *   1. `src/charts/color-contrast.test.ts` — o portão de contraste passou a aferir contra
 *      `chartSurfaceTheme().backgroundColor`, isto é, contra o valor que `createChart` RECEBE.
 *      Prova a ARITMÉTICA.
 *   2. `src/app/symbol/chart-construction.test.ts` — toda chamada de `createChart` que monta um
 *      gráfico tira as opções de `chartConstructorOptions()`. Prova o que está ESCRITO, inclusive
 *      num arquivo que ainda não existe.
 *   3. **este arquivo** — lê os PIXELS do `<canvas>` real, num browser real. É o único que não
 *      acredita em nenhuma das duas: se a biblioteca mudar a semântica de `layout`, se um CSS
 *      pintar por cima, se o `applyOptions` de outra série redefinir o fundo, os dois de cima
 *      continuam verdes e **este** reprova.
 *
 * ⛔ Sem o item 3, a correção inteira seria uma afirmação sobre o código sobre si mesmo — que é
 * exatamente a classe de prova que deixou `1,22:1` chegar à tela.
 *
 * ── O QUE ELE MEDE, E POR QUE PELA MODA E NÃO POR UM PIXEL ───────────────────────────────────
 *
 * Um pixel isolado pode cair em cima de uma série, de uma linha de grade ou do eixo. A COR MODAL
 * do canvas é o fundo por construção: a tinta ocupa uma fração pequena da área (o painel de CVD
 * desta janela tem ~95% de vão declarado), e nenhuma série preenche o fundo. A asserção é sobre
 * a moda e sobre a FRAÇÃO que ela ocupa — as duas, porque "a moda é #131722" sozinha ficaria
 * verde num canvas majoritariamente branco onde `#131722` ainda fosse o valor mais comum entre
 * os restantes.
 *
 * ⛔ NADA AQUI SEMEIA NADA (`[P-seed]`): é leitura de uma página já servida, sem `INSERT`, sem
 * `psql`, sem `docker`. E ele vale nos DOIS universos de `D1.11` — o fundo do canvas não depende
 * de a API ter respondido `200` ou `500`, que é justamente o que o torna barato de rodar sempre.
 */

const SPEC = "11-canvas-fundo";
const SYMBOL_PATH = "/symbol";

/** `#rrggbb` minúsculo, a grafia que `SURFACE_BASE` usa. */
function toHex(channels: readonly number[]): string {
  return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

test("DR-1: o fundo de TODO canvas de /symbol é o mesmo #131722 da página", async ({ page }) => {
  await page.goto(SYMBOL_PATH);
  // Os três painéis montam por `useEffect`, então o canvas não existe no HTML servido — e um
  // canvas ANEXADO ainda não é um canvas PINTADO. Esperar só pelo `attached` leria `width === 0`
  // e a medição sairia vazia, que é a vacuidade que a asserção de universo lá embaixo recusa.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((canvas) => canvas.width > 0 && canvas.height > 0),
    undefined,
    { timeout: 15_000 },
  );

  const measured = await page.evaluate(() => {
    const results: { modal: number[]; share: number; sampled: number; area: number }[] = [];
    for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) continue;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      const data = context.getImageData(0, 0, width, height).data;
      const tally = new Map<string, number>();
      let sampled = 0;
      // Passo de 4 px nos dois eixos: ~1/16 da área, suficiente para a moda e barato o bastante
      // para não estourar o tempo do spec num canvas de devicePixelRatio 2.
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const at = (y * width + x) * 4;
          // Pixel transparente não é cor pintada — o canvas do eixo de tempo tem bordas assim.
          if (data[at + 3] === 0) continue;
          const key = `${data[at]},${data[at + 1]},${data[at + 2]}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
          sampled += 1;
        }
      }
      if (sampled === 0) continue;
      let best = "";
      let bestCount = 0;
      for (const [key, count] of tally) {
        if (count > bestCount) {
          best = key;
          bestCount = count;
        }
      }
      results.push({
        modal: best.split(",").map((n) => Number(n)),
        share: bestCount / sampled,
        sampled,
        area: width * height,
      });
    }
    return results;
  });

  fact(SPEC, "canvases_measured", measured.length);
  fact(
    SPEC,
    "canvas_modal_colors",
    measured.map((entry) => ({ color: toHex(entry.modal), share: Number(entry.share.toFixed(4)) })),
  );

  expect(
    measured.length,
    "nenhum canvas com pixel pintado foi encontrado em /symbol — sem universo não há medição, e um spec que " +
      "não encontra o que mede fica verde por vacuidade (o `rc=0` de `ADR-012`)",
  ).toBeGreaterThan(0);

  for (const entry of measured) {
    const modal = toHex(entry.modal);
    expect(
      modal,
      `um <canvas> de /symbol está sendo limpo em ${modal}, não em ${SURFACE_BASE}. Foi assim que DR-1 chegou à ` +
        "tela: `createChart` sem `layout` deixa o default #FFFFFF da biblioteca, e sobre ele a linha de delta do " +
        "CVD (#e6e9ef) mede 1,22:1 — invisível — enquanto o portão de contraste, que afere contra a superfície da " +
        "página, continua lendo 14,72:1.",
    ).toBe(SURFACE_BASE);
    expect(
      entry.share,
      `a cor modal ${modal} ocupa só ${(entry.share * 100).toFixed(1)}% dos pixels amostrados; um fundo que não é ` +
        "maioria não é fundo, e a asserção acima passaria sobre um canvas majoritariamente de outra cor",
    ).toBeGreaterThan(0.5);
  }
});
