// D8.19 spike runner. One command, one number: the WORST-case X error in pixels between
// the coordinate Lightweight Charts assigns and the one `event_time` implies, under the
// full 1,728-item load.
//
// Run it with: npm --prefix frontend run spike:axis
//
// ── EXIT CODES, same semantics the backend scripts already use ────────────────────────
//
//   0 = measured, and the axis holds
//   1 = measured, and it does not (this is a RESULT, not a crash)
//   3 = REFUSED to measure -- distinct from measuring and failing
//
// ── WHY A GREEN ON ITS OWN WOULD BE WORTHLESS HERE, and the runner enforces it ────────
//
// Scenario A (complete one-minute grid) is the DoD read literally. But on a complete grid
// the ordinal axis of Lightweight Charts and a linear time axis ARE the same function, so
// scenario A cannot fail no matter how badly the library behaved -- a green there measures
// the grid, not the axis. Scenario B thins the same grid to the 1 m coverage plan 08 D8.11
// actually measured (20.0%) and MUST exceed the tolerance. If it does not, the instrument
// has no power to reject, and this runner exits non-zero even though "everything passed" --
// because a green from an instrument that cannot say no is not evidence.
//
// Operator-facing output is pt-BR (CLAUDE.md boundary table, line 8: "microcopy de
// operador"), matching the precedent of scripts/verify.sh and backend/scripts/lint.sh.
// Every identifier is English (lines 1-4).

import { measureAxisFidelity, TOLERANCE_PX } from "./axis-fidelity.ts";
import type { FidelityReport } from "./axis-fidelity.ts";
import { collectAxisCoordinates } from "./headless-chart.ts";
import {
  buildFullGridWorkload,
  buildSparseGridWorkload,
  CANDLE_COUNT,
  POINT_COUNT,
} from "./synthetic-series.ts";
import type { SyntheticWorkload } from "./synthetic-series.ts";

/** The 1 m coverage plan 08 D8.11 measured on the real feed. */
const MEASURED_ONE_MINUTE_COVERAGE = 0.2;

/** Fixed so the thinned grid is identical on every machine. */
const THINNING_SEED = 20260829;

const EXIT_MEASURED_AND_PASSED = 0;
const EXIT_MEASURED_AND_FAILED = 1;
const EXIT_REFUSED_TO_MEASURE = 3;

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function complain(line: string): void {
  process.stderr.write(`${line}\n`);
}

function px(value: number): string {
  // A worst case of "0.000" would hide the difference between an exactly affine map and
  // one that is off by float noise. Below a thousandth of a pixel, show the exponent.
  if (value !== 0 && Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(3);
}

function isoOf(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
}

interface Scenario {
  key: string;
  label: string;
  workload: SyntheticWorkload;
  /** What the run has to show for the scenario to have done its job. */
  expectation: "dentro da tolerancia" | "fora da tolerancia";
}

async function runScenario(scenario: Scenario): Promise<FidelityReport> {
  const { samples, timeScaleWidthPx, unplacedCount } = await collectAxisCoordinates(
    scenario.workload,
  );
  if (unplacedCount > 0) {
    throw new Error(
      `o grafico recusou posicionar ${unplacedCount} item(ns) de ${scenario.key}; ` +
        "a medicao seria sobre um universo diferente do declarado",
    );
  }
  const report = measureAxisFidelity(samples, TOLERANCE_PX);

  const itemCount = scenario.workload.candles.length + scenario.workload.points.length;
  say("");
  say(`── ${scenario.label}`);
  say(
    `   universo        : ${report.sampleCount} itens ` +
      `(${scenario.workload.candles.length} candles + ${scenario.workload.points.length} pontos), ` +
      `${report.distinctTimeCount} timestamps distintos no eixo`,
  );
  if (itemCount !== report.sampleCount) {
    throw new Error("invariante quebrada: itens gerados != itens medidos");
  }
  say(`   pane do eixo    : ${px(report.spanPx)} px entre as ancoras (timeScale.width() = ${timeScaleWidthPx} px)`);
  say(`   PIOR CASO       : ${px(report.worstErrorPx)} px  (tolerancia D8.19 = ${px(report.tolerancePx)} px)`);
  say(
    `   onde            : ${isoOf(report.worstSample.time)} · serie ${report.worstSample.source} · ` +
      `x real ${px(report.worstSample.actualX)} px vs x esperado ${px(report.worstSample.expectedX)} px`,
  );
  say(`   media (contexto): ${px(report.meanErrorPx)} px — NAO e o criterio`);
  say(
    `   veredito        : ${report.withinTolerance ? "DENTRO" : "FORA"} da tolerancia ` +
      `(esperado deste cenario: ${scenario.expectation})`,
  );
  return report;
}

async function main(): Promise<number> {
  say("=== D8.19 · spike do eixo do Lightweight Charts sob CARGA CHEIA ===");
  say(`carga: ${CANDLE_COUNT} candles de 1 m + ${POINT_COUNT} pontos de 5 m = ${CANDLE_COUNT + POINT_COUNT} itens, um unico eixo`);

  const full = await runScenario({
    key: "A",
    label: "Cenario A — grade de 1 m COMPLETA (o DoD, lido ao pe da letra)",
    workload: buildFullGridWorkload(),
    expectation: "dentro da tolerancia",
  });

  const sparse = await runScenario({
    key: "B",
    label:
      `Cenario B — MUTACAO: mesma janela com cobertura de 1 m em ` +
      `${(MEASURED_ONE_MINUTE_COVERAGE * 100).toFixed(1)}% (plano 08, D8.11)`,
    workload: buildSparseGridWorkload(MEASURED_ONE_MINUTE_COVERAGE, THINNING_SEED),
    expectation: "fora da tolerancia",
  });

  say("");
  say("── Veredito");
  if (sparse.withinTolerance) {
    complain(
      "REPROVA O PROPRIO INSTRUMENTO: o cenario B ficou DENTRO da tolerancia, entao esta\n" +
        "medicao nao tem poder de rejeitar e o verde do cenario A nao prova nada.",
    );
    return EXIT_MEASURED_AND_FAILED;
  }
  say(
    `   o instrumento REJEITA: cenario B deu ${px(sparse.worstErrorPx)} px ` +
      `(${(sparse.worstErrorPx / TOLERANCE_PX).toFixed(0)}x a tolerancia).`,
  );
  if (!full.withinTolerance) {
    complain(
      `D8.19 FALHA: com a grade completa o pior caso e ${px(full.worstErrorPx)} px, ` +
        `acima dos ${px(TOLERANCE_PX)} px declarados.`,
    );
    return EXIT_MEASURED_AND_FAILED;
  }
  say(
    `   D8.19 PASSA no caso literal: pior caso ${px(full.worstErrorPx)} px <= ${px(TOLERANCE_PX)} px, ` +
      `n = ${full.sampleCount}.`,
  );
  say("   RESSALVA, e ela e o achado: o eixo do Lightweight Charts e ORDINAL, nao temporal.");
  say("   O verde de A vale enquanto a grade for completa; o cenario B mostra o que acontece");
  say("   quando ela nao e. Ver docs/context/plataforma-dados/gates/T-08.2-builder.md.");
  return EXIT_MEASURED_AND_PASSED;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    complain(`RECUSA: nao consegui medir — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_REFUSED_TO_MEASURE;
  },
);
