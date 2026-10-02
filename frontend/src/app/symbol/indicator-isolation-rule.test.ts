// `ADR-050/D6` + `SPEC-011 §5.3` (`T-00.2`, plan `00` DoD 1 and 2) — the rule test of
// `local/indicator-isolation` (`../../../eslint-rules/indicator-isolation.mjs`), in the pattern of
// `use-client-fingerprint-boundary` (`src/features/s1-console/fingerprint-sync-boundary.test.ts`):
// the REAL project config (`../../../eslint.config.mjs`) is loaded and run over probe sources.
//
// Unlike that precedent, the probes here are NOT written to disk: each one is a source string
// linted with `ESLint.lintText(code, { filePath })` under a VIRTUAL file name inside
// `src/app/symbol/`. The rule resolves paths lexically and never stats a file, so a virtual name
// is exactly as good as a real one — and nothing can be left behind in the tree. The probes are
// PERMANENT (`T-00.2` DoD): deleting one of them is deleting part of the gate.
//
// The nine probes of `SPEC-011 §5.3`:
//   MORDE (5) — P1 by `import`, by `import()` and by `require`; P2; P3 → `local/indicator-isolation`.
//   CALA  (4) — the three "cala" cells of the table, plus `indicators/selection/probe.ts` →
//               `../catalog.ts` (the selection is not an indicator folder, `SPEC-011 §5.3`).
// Plus the barrel probe (DoD 2): `indicators/cvd/probe-deep.ts` → `../../../../charts/s2-panels.ts`
// still bites by `no-restricted-imports` — the `ADR-034/D8` block was not replaced by the new rule.
//
// MORDE is asserted in the same run as CALA (`ADR-012` vacuity falsifier): a rule that stopped
// matching cannot hide behind a clean result that means "the rule has no teeth".
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../../..");
const SYMBOL_ROOT = path.join(FRONTEND_ROOT, "src/app/symbol");

const RULE_ID = "local/indicator-isolation";

const eslint = new ESLint({ cwd: FRONTEND_ROOT });

interface Probe {
  /** Virtual file name, relative to `src/app/symbol/` unless it starts with `../`. */
  readonly file: string;
  readonly code: string;
}

async function lintProbe(probe: Probe): Promise<readonly Linter.LintMessage[]> {
  const filePath = path.resolve(SYMBOL_ROOT, probe.file);
  const [result] = await eslint.lintText(probe.code, { filePath });
  assert.ok(result !== undefined, `eslint returned no result for ${probe.file}`);
  // A fatal message (parse error) would make every assertion below vacuous.
  const fatal = result.messages.filter((message) => message.fatal === true);
  assert.deepEqual(fatal, [], `probe ${probe.file} did not parse`);
  return result.messages;
}

/** The prohibitions (`P1`/`P2`/`P3`) this rule reported on the probe, in order. */
function isolationHits(messages: readonly Linter.LintMessage[]): readonly (string | undefined)[] {
  return messages.filter((message) => message.ruleId === RULE_ID).map((message) => message.messageId);
}

function ruleIds(messages: readonly Linter.LintMessage[]): readonly (string | null)[] {
  return messages.map((message) => message.ruleId).sort();
}

// ── The nine probes of SPEC-011 §5.3, by name — the names are what the gate report cites ───────

const BITES: readonly (Probe & { readonly name: string; readonly prohibition: string })[] = [
  {
    name: "P1 by import",
    prohibition: "P1",
    file: "indicators/oi/probe.ts",
    code: 'import { x } from "../cvd/x.ts";\nexport const probe = x;\n',
  },
  {
    name: "P1 by import()",
    prohibition: "P1",
    file: "indicators/oi/probe.ts",
    code: 'export const probe = import("../cvd/x.ts");\n',
  },
  {
    name: "P1 by require",
    prohibition: "P1",
    file: "indicators/oi/probe.ts",
    code: 'export const probe = require("../cvd/x.ts");\n',
  },
  {
    name: "P2",
    prohibition: "P2",
    file: "chart/host/probe.ts",
    code: 'import { definition } from "../../indicators/oi/definition.ts";\nexport const probe = definition;\n',
  },
  {
    name: "P3",
    prohibition: "P3",
    file: "probe.ts",
    code: 'import { definition } from "./indicators/oi/definition.ts";\nexport const probe = definition;\n',
  },
];

const STAYS_QUIET: readonly (Probe & { readonly name: string })[] = [
  {
    name: "P1 cala: indicator -> core and -> contract",
    file: "indicators/oi/probe.ts",
    code:
      'import { absence } from "../../chart/marks/absence.ts";\n' +
      'import type { IndicatorDefinition } from "../contract.ts";\n' +
      "export const probe = absence;\n" +
      "export type Probe = IndicatorDefinition;\n",
  },
  {
    name: "P2 cala: core -> core",
    file: "chart/host/probe.ts",
    code: 'import { absence } from "../marks/absence.ts";\nexport const probe = absence;\n',
  },
  {
    name: "P3 cala: catalog -> indicator",
    file: "indicators/catalog.ts",
    code: 'import { definition } from "./oi/definition.ts";\nexport const probe = definition;\n',
  },
  {
    name: "selection is not an indicator folder: selection -> catalog",
    file: "indicators/selection/probe.ts",
    code: 'import { catalog } from "../catalog.ts";\nexport const probe = catalog;\n',
  },
];

const BARREL_PROBE: Probe = {
  file: "indicators/cvd/probe-deep.ts",
  code: 'import { panels } from "../../../../charts/s2-panels.ts";\nexport const probe = panels;\n',
};

test("SPEC-011 §5.3: the nine probes — 5 bite with local/indicator-isolation, 4 stay quiet", async () => {
  assert.equal(BITES.length + STAYS_QUIET.length, 9, "SPEC-011 §5.3 fixes nine probes");

  for (const probe of BITES) {
    const messages = await lintProbe(probe);
    assert.deepEqual(
      isolationHits(messages),
      [probe.prohibition],
      `MORDE "${probe.name}" (${probe.file}): expected exactly one ${probe.prohibition} from ` +
        `${RULE_ID}, got ${JSON.stringify(messages.map((m) => [m.ruleId, m.messageId]))}`,
    );
  }

  for (const probe of STAYS_QUIET) {
    const messages = await lintProbe(probe);
    assert.deepEqual(
      ruleIds(messages),
      [],
      `CALA "${probe.name}" (${probe.file}): expected no message at all, got ` +
        JSON.stringify(messages.map((m) => [m.ruleId, m.message])),
    );
  }
});

test("ADR-034/D8 is intact: a deep charts import from indicators/<kind>/ still bites by no-restricted-imports", async () => {
  const messages = await lintProbe(BARREL_PROBE);
  assert.deepEqual(
    ruleIds(messages),
    ["no-restricted-imports"],
    "the barrel probe must be refused by the ADR-034/D8 no-restricted-imports block — if it is " +
      "quiet, a block for indicators/** replaced the barrel options (last block wins)",
  );
  // The ruleId alone is not enough: a replacing `no-restricted-imports` block with a wide
  // pattern would ALSO report this import, under its own message. Only the ADR-034/D8 message
  // proves that the barrel options themselves survived.
  assert.match(
    messages[0]?.message ?? "",
    /ADR-034\/D8/,
    "the barrel probe was refused, but not by the ADR-034/D8 options — they were replaced",
  );
});

// ── Beyond the nine: the other reference forms and edges the rule claims to resolve ────────────

test("every reference form is resolved by PATH, not by string", async () => {
  const forms: readonly (Probe & { readonly prohibition: string })[] = [
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export { x } from "../cvd/x.ts";\n' },
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export * from "../cvd/x.ts";\n' },
    // extension-less specifier: the same target as `../cvd/x.ts`
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export { x } from "../cvd/x";\n' },
    // a detour through the core still lands in another indicator
    {
      prohibition: "P1",
      file: "indicators/oi/probe.ts",
      code: 'export { x } from "../../chart/../indicators/cvd/x.ts";\n',
    },
    {
      prohibition: "P1",
      file: "indicators/oi/probe.ts",
      code: "export const probe = import(`../cvd/x.ts`);\n",
    },
    {
      prohibition: "P1",
      file: "indicators/oi/probe.ts",
      code: 'import type { X } from "../cvd/x.ts";\nexport type Probe = X;\n',
    },
    {
      prohibition: "P1",
      file: "indicators/oi/probe.ts",
      code: 'export type Probe = import("../cvd/x.ts").X;\n',
    },
    {
      prohibition: "P1",
      file: "indicators/oi/probe.ts",
      code: 'import x = require("../cvd/x.ts");\nexport const probe = x;\n',
    },
  ];
  for (const probe of forms) {
    const messages = await lintProbe(probe);
    assert.deepEqual(
      isolationHits(messages),
      [probe.prohibition],
      `form ${JSON.stringify(probe.code)} was not refused as ${probe.prohibition}`,
    );
  }
});

test("the rest of the table: P1 targets, P2 from chrome and onto contract, P3 from outside the route", async () => {
  const edges: readonly (Probe & { readonly prohibition: string | null })[] = [
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export { c } from "../catalog.ts";\n' },
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export { s } from "../selection/state.ts";\n' },
    // RN-5: `indicators/_shared/` is just another indicator folder, so reaching into it is P1
    { prohibition: "P1", file: "indicators/oi/probe.ts", code: 'export { s } from "../_shared/x.ts";\n' },
    { prohibition: "P2", file: "chart/host/probe.ts", code: 'export type { D } from "../../indicators/contract.ts";\n' },
    { prohibition: "P2", file: "chart/history/probe.ts", code: 'export { c } from "../../indicators/catalog.ts";\n' },
    { prohibition: "P2", file: "chrome/probe.ts", code: 'export { d } from "../indicators/oi/definition.ts";\n' },
    { prohibition: "P3", file: "SymbolClient.tsx", code: 'export { d } from "./indicators/oi/definition.ts";\n' },
    { prohibition: "P3", file: "[symbol]/page.tsx", code: 'export { d } from "../indicators/oi/definition.ts";\n' },
    { prohibition: "P3", file: "indicators/selection/probe.ts", code: 'export { d } from "../oi/definition.ts";\n' },
    { prohibition: "P3", file: "../console/probe.ts", code: 'export { d } from "../symbol/indicators/oi/definition.ts";\n' },
    // test files are judged too: an indicator's tests live in its folder
    { prohibition: "P3", file: "panel.test.ts", code: 'export { d } from "./indicators/oi/definition.ts";\n' },
    { prohibition: null, file: "indicators/oi/definition.test.ts", code: 'export { d } from "./definition.ts";\n' },
    { prohibition: null, file: "indicators/oi/probe.ts", code: 'export { d } from "./definition.ts";\n' },
    { prohibition: null, file: "SymbolClient.tsx", code: 'export { c } from "./indicators/catalog.ts";\n' },
    { prohibition: null, file: "[symbol]/page.tsx", code: 'export type { D } from "../indicators/contract.ts";\n' },
    { prohibition: null, file: "indicators/oi/probe.ts", code: 'export { r } from "react";\n' },
  ];
  for (const probe of edges) {
    const messages = await lintProbe(probe);
    assert.deepEqual(
      isolationHits(messages),
      probe.prohibition === null ? [] : [probe.prohibition],
      `${probe.file}: ${JSON.stringify(probe.code)} — expected ${probe.prohibition ?? "no report"}`,
    );
  }
});
