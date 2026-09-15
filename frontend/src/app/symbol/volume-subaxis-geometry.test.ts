/**
 * `T-01.8` — A GEOMETRIA DO SUB-EIXO DE VOLUME, MEDIDA EM PIXEL CONTRA A BIBLIOTECA REAL.
 *
 * Este arquivo existe porque o `design_gate` da fase `01`
 * (`docs/context/cinco-metricas-do-core/gates/design-01.md`) reprovou com DOIS achados
 * `BLOCKER` que são aritméticos, e nenhum instrumento deste repositório era capaz de vê-los:
 *
 *   - `BLOCKER-1` — escala LINEAR ancorada no máximo da janela ⇒ `954/1.404` barras presentes
 *     (`67,9%`) abaixo de 1 pixel físico, barra mediana de `0,62 px`. WCAG 1.4.11 reprova.
 *   - `BLOCKER-2` — `WhitespaceItem` não desenha marca nenhuma ⇒ "não sabemos" e "foi zero"
 *     são os mesmos pixels: nenhum. `STITCH_CONTEXT.md:1821-1825` / `D5.3` proíbem.
 *
 * ⚠️ POR QUE ISTO NÃO É MAIS UM SCAN DE FONTE, e a diferença é a razão de o arquivo existir:
 * `volume-subaxis-dom-contract.test.ts` prova que os literais estão ESCRITOS onde o contrato
 * exige — e com a suíte inteira verde, os `67,9%` sub-pixel passaram despercebidos por duas
 * tasks. Altura de barra não é uma string que se possa grepar: ela sai da interação entre o
 * modo da escala, a base do histograma, as margens e a altura do painel. Só a biblioteca sabe
 * o número, então é dela que este arquivo o pede (`priceToCoordinate`), num `jsdom`, com o
 * MESMO shim que `charts` já usa para medir fidelidade de eixo.
 *
 * ⛔ E AS CONSTANTES SÃO LIDAS DO FONTE DE PRODUÇÃO, NÃO REDIGITADAS AQUI. Uma cópia das
 * margens/base/alturas neste arquivo mediria a configuração que ESTE arquivo escolheu, não a
 * que a tela desenha — e passaria verde enquanto a produção regride, que é exatamente a classe
 * de falso-verde que o laudo achou. Toda constante de forma vem de `SymbolClient.tsx` por
 * regex; se uma delas for renomeada, o parse falha e o teste REPROVA em vez de medir o default.
 *
 * O UNIVERSO: uma série sintética de cauda longa com `max/p50 ~ 60x` — a razão MEDIDA no dado
 * real de 24h (`max 4.931,19 / p50 81,07 = 60,8x`, `n=1.404`). Sintética e não o corpus de
 * disco de propósito: o que reprova aqui é a RAZÃO entre máximo e mediana, que é propriedade da
 * distribuição, e amarrar isso a um CSV não-versionado transformaria um portão de forma numa
 * `RECUSA` por ambiente (`scripts/verify.sh` §1c).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { absenceMarkSeries, flushFrames, installGlobals, positiveValueSeriesLossless, zeroMarkSeries } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** Lê uma constante numérica de módulo do fonte de produção. Reprova em vez de defaultar: um
 * default aqui é a medição silenciosamente trocando de objeto. */
function productionNumber(name: string): number {
  const match = new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?);`).exec(source);
  assert.ok(match !== null, `${name} não foi encontrada em SymbolClient.tsx — a âncora mudou, conserte este teste`);
  return Number(match[1]);
}

const CHART_HEIGHT_PX = productionNumber("CHART_HEIGHT_PX");
const VOLUME_LOG_BASE = productionNumber("VOLUME_LOG_BASE");
const ABSENCE_MARK_PX = productionNumber("ABSENCE_MARK_PX");
const ZERO_MARK_PX = productionNumber("ZERO_MARK_PX");

const MARGINS_DECLARATION = /const VOLUME_SCALE_MARGINS = \{ top: (\d+(?:\.\d+)?), bottom: (\d+(?:\.\d+)?) \} as const;/;
const marginsMatch = MARGINS_DECLARATION.exec(source);
assert.ok(marginsMatch !== null, "VOLUME_SCALE_MARGINS não foi encontrada em SymbolClient.tsx");
const VOLUME_SCALE_MARGINS = { top: Number(marginsMatch[1]), bottom: Number(marginsMatch[2]) };
const VOLUME_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - VOLUME_SCALE_MARGINS.top);

/** O modo de escala que a produção aplica à escala do volume, lido do fonte — `"Logarithmic"`,
 * `"Normal"` ou `null` quando nenhum modo é aplicado (que É o modo linear, o defeito). */
function productionVolumeScaleMode(): string | null {
  const match = /volumeSeries\s*\n?\s*\.priceScale\(\)[\s\S]{0,200}?mode: PriceScaleMode\.(\w+)/.exec(source);
  return match === null ? null : match[1]!;
}

// ── O universo sintético: cauda longa com a razão max/p50 do dado real ───────────────────────

const ONE_MINUTE_MS = 60_000;
/** A largura do painel só entra na LARGURA da barra, nunca na altura — que é o que este arquivo
 * mede. Fixada mesmo assim para que a medição não dependa do `clientWidth` de um `<div>` de jsdom
 * (que é `0`, e o componente cairia no `|| 600` dele). */
const MEASUREMENT_WIDTH_PX = 1_200;
const GRID_SLOTS = 1_440;
const ABSENT_EVERY = 40;
const ZERO_AT_INDEX = 500;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

/** A razão `max/p50` MEDIDA no dado real de 24h — `4.931,19 / 81,07`, `n=1.404`
 * (`gates/design-01.md` §2). É ELA que produz o defeito, não a amplitude sozinha: uma
 * distribuição log-uniforme sobre a mesma amplitude dá `22x` e deixa "só" 40% das barras
 * sub-pixel, fraco demais para servir de controle negativo `[MEDIDO 2026-09-15]`. */
const REAL_MAX_OVER_P50 = 60.8;
const SYNTHETIC_MIN = 10;
const SYNTHETIC_MAX = 4_931;
/** Expoente que enviesa a sequência de baixa discrepância para dentro do log-espaço até a
 * mediana cair onde a real cai: `0,5 ** SKEW` tem de valer `log10(p50/min) / log10(max/min)`,
 * que no dado real é `(1,909 - 1,026) / (3,693 - 1,026) = 0,331` ⇒ `SKEW = ln(0,331)/ln(0,5)`.
 * Escrito como número e VERIFICADO pelo teste do universo abaixo, para que um ajuste de
 * conveniência aqui reprove em vez de afrouxar o controle negativo em silêncio. */
const SKEW = 1.6;

/** Cauda longa entre `10` e `4.931`, com a MESMA razão `max/p50` do dado real de 24h, por um
 * gerador determinístico (nada de `Math.random`: um teste que muda de universo a cada rodada não
 * é um portão). */
function syntheticVolumeSlots(): readonly Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const time = i * ONE_MINUTE_MS;
    if (i === ZERO_AT_INDEX) {
      slots.push({ time, value: 0 });
    } else if (i % ABSENT_EVERY === 0) {
      slots.push({ time, value: null });
    } else {
      // Sequência de baixa discrepância (Van der Corput base 2), mapeada em log-espaço.
      let bits = i;
      let fraction = 0;
      let denominator = 0.5;
      while (bits > 0) {
        fraction += (bits % 2) * denominator;
        bits = Math.floor(bits / 2);
        denominator /= 2;
      }
      slots.push({
        time,
        value: SYNTHETIC_MIN * 10 ** (fraction ** SKEW * Math.log10(SYNTHETIC_MAX / SYNTHETIC_MIN)),
      });
    }
  }
  return slots;
}

interface Measurement {
  readonly barHeightsPx: readonly number[];
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
}

/** Monta o sub-eixo com a configuração de produção (`mode` parametrizado só para o controle
 * negativo) e devolve a altura EM PIXEL de cada marca, perguntada à própria biblioteca. */
async function measureSubAxis(slots: readonly Slot[], mode: "Logarithmic" | "Normal"): Promise<Measurement> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "invariante quebrada: o container do gráfico não existe no DOM");

  // ⛔ As opções saem de `chartConstructorOptions`, a MESMA chamada de `useLightweightChart`, e
  // não de um objeto escrito aqui. Duas razões, e nenhuma é de estilo: (i) medir a geometria de
  // um painel construído por outro construtor mediria outro painel; (ii) `chart-construction.test.ts`
  // (`DR-1`) exige isso de todo `createChart` sob `app/` — e a exigência está certa, porque um
  // `createChart` que escreve as próprias opções é como `DR-1` foi para produção.
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX));
  const volumeSeries = chart.addSeries(lc.HistogramSeries, {
    priceScaleId: "volume",
    base: VOLUME_LOG_BASE,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: VOLUME_SCALE_MARGINS,
    mode: mode === "Logarithmic" ? lc.PriceScaleMode.Logarithmic : lc.PriceScaleMode.Normal,
  });
  volumeSeries.setData(positiveValueSeriesLossless(slots) as never);

  const markStyle = {
    priceScaleId: "volume_marks",
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: VOLUME_MARKS_BAND_PX } }),
  };
  const absence = chart.addSeries(lc.HistogramSeries, markStyle);
  absence.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
  absence.setData(absenceMarkSeries(slots, ABSENCE_MARK_PX) as never);
  const zero = chart.addSeries(lc.HistogramSeries, markStyle);
  zero.setData(zeroMarkSeries(slots, ZERO_MARK_PX) as never);

  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barBase = volumeSeries.priceToCoordinate(VOLUME_LOG_BASE);
  const markBase = absence.priceToCoordinate(0);
  assert.ok(barBase !== null && markBase !== null, "a biblioteca não posicionou a linha de base — a medição seria vazia");
  const barHeightsPx = slots
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => {
      const coordinate = volumeSeries.priceToCoordinate(slot.value);
      assert.ok(coordinate !== null, `a barra de ${slot.value} não recebeu coordenada`);
      return (barBase as number) - (coordinate as number);
    });
  const heightOf = (series: typeof absence, value: number): number => {
    const coordinate = series.priceToCoordinate(value);
    assert.ok(coordinate !== null, `a marca de ${value} não recebeu coordenada`);
    return (markBase as number) - (coordinate as number);
  };
  const measurement = {
    barHeightsPx,
    absenceMarkPx: heightOf(absence, ABSENCE_MARK_PX),
    zeroMarkPx: heightOf(zero, ZERO_MARK_PX),
  };
  chart.remove();
  dom.window.close();
  return measurement;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** O piso do `BLOCKER-1`: 1 pixel FÍSICO. Abaixo dele a barra é indistinguível da ausência —
 * e `lightweight-charts` tem um `Math.max(1, …)` no fonte minificado que o laudo explicitamente
 * NÃO conseguiu provar ser de altura; se for, as barras sub-pixel viram todas iguais e o
 * sub-eixo deixa de codificar volume. Os dois ramos são defeito, e este piso mata os dois. */
const PIXEL_FLOOR = 1;
/** A mediana tem de ser confortavelmente legível, não só "acima de zero". `6 px` é uma fração
 * pequena da banda útil medida (~37 px) e ainda assim ~10x o que a escala linear entregava. */
const MEDIAN_FLOOR_PX = 6;

test("o universo sintético reproduz a razão max/p50 do dado real — sem ela o controle negativo é fraco", () => {
  // ⛔ O UNIVERSO É DECLARADO E VERIFICADO, não assumido. O que produz o `BLOCKER-1` é a RAZÃO
  // entre o máximo e a mediana; se um ajuste aqui a encolher, a escala linear deixa de reprovar e
  // o controle negativo abaixo vira decoração — reprovando ANTES, neste teste, em vez de depois,
  // em silêncio.
  const values = syntheticVolumeSlots()
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => slot.value);
  const ratio = Math.max(...values) / median(values);
  assert.ok(
    Math.abs(ratio - REAL_MAX_OVER_P50) / REAL_MAX_OVER_P50 < 0.15,
    `max/p50 sintético = ${ratio.toFixed(1)}x contra ${REAL_MAX_OVER_P50}x medidos no dado real de 24h`,
  );
});

test("BLOCKER-1: nenhuma barra presente cai abaixo de 1 pixel, e a mediana é legível", async () => {
  const slots = syntheticVolumeSlots();
  const { barHeightsPx } = await measureSubAxis(slots, "Logarithmic");
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.ok(barHeightsPx.length > 1_000, `universo pequeno demais (${barHeightsPx.length}) — a medição seria fraca`);
  assert.equal(
    subPixel.length,
    0,
    `${subPixel.length}/${barHeightsPx.length} barras abaixo de ${PIXEL_FLOOR}px — é o BLOCKER-1 de volta (WCAG 1.4.11)`,
  );
  const p50 = median(barHeightsPx);
  assert.ok(
    p50 >= MEDIAN_FLOOR_PX,
    `barra mediana de ${p50.toFixed(2)}px, abaixo do piso de ${MEDIAN_FLOOR_PX}px`,
  );
});

test("MORDE: a MESMA série na escala LINEAR reprova a asserção acima — o controle negativo", async () => {
  // ⛔ Sem esta metade, o verde acima não é evidência: seria uma afirmação que o instrumento
  // nunca foi mostrado capaz de rejeitar (`axis-spike.ts`, mesmo argumento). Aqui a mutação é a
  // configuração ANTERIOR, literalmente — a que o gate reprovou.
  const slots = syntheticVolumeSlots();
  const { barHeightsPx } = await measureSubAxis(slots, "Normal");
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.ok(
    subPixel.length > barHeightsPx.length / 2,
    `a escala linear deixou só ${subPixel.length}/${barHeightsPx.length} barras sub-pixel — o controle ` +
      `negativo parou de reproduzir o defeito, e sem ele o teste acima não prova nada`,
  );
  assert.ok(
    median(barHeightsPx) < PIXEL_FLOOR,
    "a mediana linear deixou de ser sub-pixel — reancore este controle em vez de apagá-lo",
  );
});

test("BLOCKER-1: a produção APLICA o modo logarítmico — o modo medido acima é o modo da tela", async () => {
  // A medição acima usaria a configuração certa mesmo que a produção usasse a errada; esta é a
  // amarra entre as duas. `null` (nenhum `mode` aplicado) É o defeito: o default é linear.
  assert.equal(
    productionVolumeScaleMode(),
    "Logarithmic",
    "a escala do sub-eixo de volume em SymbolClient.tsx não é logarítmica — BLOCKER-1",
  );
});

test("BLOCKER-2: ausência, zero legítimo e a menor barra presente ocupam pixels DIFERENTES", async () => {
  const slots = syntheticVolumeSlots();
  const { barHeightsPx, absenceMarkPx, zeroMarkPx } = await measureSubAxis(slots, "Logarithmic");
  // 1. A ausência DESENHA — é o terceiro canal de `D5.3` que o `WhitespaceItem` não tinha.
  assert.ok(
    absenceMarkPx >= PIXEL_FLOOR,
    `a marca de ausência mede ${absenceMarkPx.toFixed(2)}px — abaixo de 1px ela não existe, que é o BLOCKER-2`,
  );
  // 2. E não desenha a MESMA coisa que o zero legítimo.
  assert.ok(
    zeroMarkPx >= 2 * absenceMarkPx,
    `zero (${zeroMarkPx.toFixed(2)}px) e ausência (${absenceMarkPx.toFixed(2)}px) não se separam por altura — ` +
      `"não houve" e "não sabemos" voltariam a ser a mesma afirmação`,
  );
  // 3. E nenhuma das duas pode ser confundida com uma barra de volume pequena: a ORDENAÇÃO é
  //    estrita, ausência < zero < menor barra presente.
  const smallestBar = Math.min(...barHeightsPx);
  assert.ok(
    smallestBar > zeroMarkPx,
    `a menor barra presente (${smallestBar.toFixed(2)}px) não supera a marca de zero (${zeroMarkPx.toFixed(2)}px)`,
  );
});

test("MORDE: apagar a série de ausência apaga as 36 lacunas — a marca não é decorativa", () => {
  // Esta metade é de CONTAGEM, não de pixel: prova que a série de marcas desenha em EXATAMENTE
  // os instantes sem dado, e whitespace no resto. Uma implementação que "marcasse tudo" ou
  // "não marcasse nada" passaria nos pisos de altura acima e reprova aqui.
  const slots = syntheticVolumeSlots();
  const absent = slots.filter((slot) => slot.value === null).length;
  const zeros = slots.filter((slot) => slot.value === 0).length;
  assert.ok(absent > 0 && zeros > 0, "o universo sintético perdeu as lacunas ou o zero — a medição seria vazia");
  const marks = absenceMarkSeries(slots, ABSENCE_MARK_PX).filter((item) => "value" in item);
  const zeroMarks = zeroMarkSeries(slots, ZERO_MARK_PX).filter((item) => "value" in item);
  assert.equal(marks.length, absent, "a série de ausência tem de marcar exatamente as lacunas");
  assert.equal(zeroMarks.length, zeros, "a série de zero tem de marcar exatamente os zeros legítimos");
  // E a série de barras não pode desenhar nem numa coisa nem na outra.
  const bars = positiveValueSeriesLossless(slots).filter((item) => "value" in item);
  assert.equal(bars.length, slots.length - absent - zeros);
});
