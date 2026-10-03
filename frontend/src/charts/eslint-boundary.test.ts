// `D5.12` ("a fronteira `charts` <-> `web` e EXECUTAVEL — o contrato reprova nas duas
// direcoes") and `ADR-034/D8` (the narrow `src/app/symbol/**` barrel exception), against the
// ESLint boundary rules in `../../eslint.config.mjs`.
//
// MORDE — every EPHEMERAL probe this file owns (8 cross-boundary violators, one per direction
//         and per import form, plus the 2 `ADR-034/D8` violators and its 1 cala probe) is
//         planted AT ONCE, `eslint` runs ONCE over exactly those files, and the probes are
//         removed in a `finally`. Each test then asserts on its own probes' `ruleId`s: a
//         violator has to be named by the boundary rule (and only by it), the `ADR-034/D8`
//         cala probe has to come back with zero messages.
//
// CALA of the REAL tree ("the real `src/**` stays green") is NOT asserted here any more
// (`T-10.5`, `UNIT-FRONT-analise` §1): it is literally `npm run lint` (`eslint src`,
// `../../package.json`), which `make lint-frontend` and `scripts/verify.sh` already run as a
// gate of their own. Re-running `eslint src` here cost 10 whole-tree lint passes (~43 s) and
// made this boundary test fail on ANY unrelated lint error in the tree.
//
// Vacuity (`ADR-012`): a probe that eslint skipped, ignored or never received would read as
// "no messages" — so every lookup below REQUIRES the probe's own entry in the JSON output,
// and the output has to carry exactly the planted set. The per-violator `ruleId` assertions
// are what keep a rule that silently stopped matching (a typo'd glob) from hiding behind a
// `rc != 0` that some OTHER probe produced.
//
// Probe names carry a per-run id, so two concurrent runs (or this file next to
// `fingerprint-sync-boundary.test.ts`, which also plants under `src/`) never lint each
// other's probes — each run passes only its own paths to eslint. A crashed run that skipped
// the `finally` leaves a probe behind, and `make lint-frontend` then refuses it loudly.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../..");
const ESLINT_BIN = path.join(FRONTEND_ROOT, "node_modules", ".bin", "eslint");

const RUN_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

interface Probe {
  readonly filePath: string;
  readonly source: string;
}

function probe(relativeDir: string, slug: string, source: string): Probe {
  return { filePath: path.join(FRONTEND_ROOT, relativeDir, `_ephemeral-${slug}-${RUN_ID}.ts`), source };
}

// ── `D5.12`, static form: `no-restricted-imports`, one probe per direction.
const CHARTS_TO_WEB_STATIC = probe(
  "src/charts",
  "morde-charts-to-web",
  'import { ROUTES } from "../app/routes.ts";\nexport const probe = ROUTES;\n',
);
const WEB_TO_CHARTS_STATIC = probe(
  "src/app",
  "morde-web-to-charts",
  'import { buildCanonicalGrid } from "../charts/canonical-grid.ts";\nexport const probe = buildCanonicalGrid;\n',
);

// ── Dynamic-import (`await import(...)`) counterparts — `no-restricted-imports` only
// registers on `ImportDeclaration`/`ExportNamedDeclaration`/`ExportAllDeclaration`
// (`node_modules/eslint/lib/rules/no-restricted-imports.js:858-864`); it never fires on
// `ImportExpression`, the AST node for `import("...")`. Independent QA found this gap live
// (`docs/context/plataforma-dados/gates/T-05.1-qa.md` §3: `await import("../charts/
// canonical-grid.ts")` from `src/app/` crossed with `rc=0`, `ruleId: []`). Closed with a second
// rule, `no-restricted-syntax` + an `esquery` selector on `ImportExpression`.
const CHARTS_TO_WEB_DYNAMIC = probe(
  "src/charts",
  "morde-charts-to-web-dynamic",
  'export async function probe() {\n  return await import("../app/routes.ts");\n}\n',
);
const WEB_TO_CHARTS_DYNAMIC = probe(
  "src/app",
  "morde-web-to-charts-dynamic",
  'export async function probe() {\n  return await import("../charts/canonical-grid.ts");\n}\n',
);

// ── Round-2 QA (`T-05.1-qa.md`, RODADA 2 §2) found the `ImportExpression[source.value=...]`
// selector only matches a `Literal` source — a bare template literal (`import(\`../charts/x.ts\`)`,
// no interpolation) and `require("../charts/x.ts")` both escaped with `rc=0`/`ruleId: []`. Both
// are closed the SAME way: an AST node with a string knowable before the program runs
// (`source.quasis.0.value.cooked` for the bare template, `arguments.0.value` for `require`).
// String concatenation and an INTERPOLATED template literal are declared OUT OF SCOPE in the
// `ADR-003` addendum instead — neither is closable by static analysis, so there is no probe for
// them here.
const CHARTS_TO_WEB_TEMPLATE = probe(
  "src/charts",
  "morde-charts-to-web-template",
  "export async function probe() {\n  return await import(`../app/routes.ts`);\n}\n",
);
const WEB_TO_CHARTS_TEMPLATE = probe(
  "src/app",
  "morde-web-to-charts-template",
  "export async function probe() {\n  return await import(`../charts/canonical-grid.ts`);\n}\n",
);
// `no-restricted-imports` never registers a `CallExpression` listener (`grep -c CallExpression
// node_modules/eslint/lib/rules/no-restricted-imports.js` -> 0), so `require(...)` needed its own
// `no-restricted-syntax` selector, not an extension of an existing rule.
const CHARTS_TO_WEB_REQUIRE = probe(
  "src/charts",
  "morde-charts-to-web-require",
  'const routes = require("../app/routes.ts");\nexport { routes };\n',
);
const WEB_TO_CHARTS_REQUIRE = probe(
  "src/app",
  "morde-web-to-charts-require",
  'const grid = require("../charts/canonical-grid.ts");\nexport { grid };\n',
);

// ── `ADR-034/D8` (`T-02.3`): 3 cases from that ADR's own falsifier table — morde-1 (deep
// import, INSIDE the exempted route), morde-2 (the SAME barrel import, OUTSIDE the exempted
// route — scope containment), cala (the barrel, inside the exempted route). All 3 run together:
// a rule that "morde"s on the wrong case (or "cala"s on both) is not the narrow exception
// `ADR-034/D8` decided.
const SYMBOL_DEEP_IMPORT = probe(
  "src/app/symbol",
  "morde-symbol-deep-import",
  'import { candlestickSeriesLossless } from "../../charts/s2-lightweight-adapter.ts";\n' +
    "export const probe = candlestickSeriesLossless;\n",
);
const CONSOLE_BARREL_LEAK = probe(
  "src/app/console",
  "morde-console-barrel-leak",
  'import { colorTokens } from "../../charts/index.ts";\nexport const probe = colorTokens;\n',
);
const SYMBOL_BARREL_CALA = probe(
  "src/app/symbol",
  "cala-symbol-barrel",
  'import { colorTokens } from "../../charts/index.ts";\nexport const probe = colorTokens;\n',
);

const ALL_PROBES: readonly Probe[] = [
  CHARTS_TO_WEB_STATIC,
  WEB_TO_CHARTS_STATIC,
  CHARTS_TO_WEB_DYNAMIC,
  WEB_TO_CHARTS_DYNAMIC,
  CHARTS_TO_WEB_TEMPLATE,
  WEB_TO_CHARTS_TEMPLATE,
  CHARTS_TO_WEB_REQUIRE,
  WEB_TO_CHARTS_REQUIRE,
  SYMBOL_DEEP_IMPORT,
  CONSOLE_BARREL_LEAK,
  SYMBOL_BARREL_CALA,
];

interface LintMessage {
  readonly ruleId: string | null;
}

interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

interface LintRun {
  readonly status: number | null;
  readonly json: readonly LintResult[];
}

function runEslintOn(filePaths: readonly string[]): LintRun {
  const result = spawnSync(ESLINT_BIN, ["--format", "json", ...filePaths], {
    cwd: FRONTEND_ROOT,
    encoding: "utf8",
  });
  // ESLint's own JSON formatter writes to stdout even on `rc=1` (lint errors found) — stdout is
  // empty only if the process failed to run at all (config error, crash), which this parse turns
  // into a loud failure instead of a silent `[]`.
  if (result.stdout.trim().length === 0) {
    throw new Error(`eslint produced no stdout (status=${result.status}); stderr: ${result.stderr}`);
  }
  return { status: result.status, json: JSON.parse(result.stdout) as LintResult[] };
}

let lintRun: LintRun | undefined;

before(() => {
  for (const { filePath } of ALL_PROBES) {
    assert.equal(existsSync(filePath), false, `probe path already exists: ${filePath}`);
  }
  try {
    for (const { filePath, source } of ALL_PROBES) {
      writeFileSync(filePath, source);
    }
    lintRun = runEslintOn(ALL_PROBES.map(({ filePath }) => filePath));
  } finally {
    for (const { filePath } of ALL_PROBES) {
      rmSync(filePath, { force: true });
    }
  }
});

function lint(): LintRun {
  assert.ok(lintRun !== undefined, "the single eslint run over the planted probes did not happen");
  return lintRun;
}

function ruleIdsFor(target: Probe): readonly (string | null)[] {
  const entry = lint().json.find((result) => result.filePath === target.filePath);
  assert.ok(entry !== undefined, `eslint returned no result for the planted probe ${target.filePath}`);
  return entry.messages.map((message) => message.ruleId);
}

test("the single eslint run covered exactly the planted probes, and reproved them (rc=1, not a crash)", () => {
  const run = lint();
  assert.equal(run.status, 1, `eslint must exit 1 (lint errors found); got ${run.status}`);
  assert.deepEqual(
    run.json.map((result) => result.filePath).sort(),
    ALL_PROBES.map(({ filePath }) => filePath).sort(),
    "eslint must lint exactly the planted probes — no more (the real tree is make lint-frontend's), no fewer",
  );
});

test("ADR-034/D8 MORDE+MORDE+CALA: `src/app/symbol/**` may import only the charts barrel, and only there", () => {
  assert.deepEqual(
    ruleIdsFor(SYMBOL_DEEP_IMPORT),
    ["no-restricted-imports"],
    "a deep charts/* import inside src/app/symbol/** must still be named by the boundary rule",
  );
  assert.deepEqual(
    ruleIdsFor(CONSOLE_BARREL_LEAK),
    ["no-restricted-imports"],
    "the barrel import must still be refused outside src/app/symbol/** (scope containment)",
  );
  assert.deepEqual(
    ruleIdsFor(SYMBOL_BARREL_CALA),
    [],
    "the sanctioned barrel import inside src/app/symbol/** must come back with zero messages",
  );
});

test("D5.12 MORDE (static form): the charts<->web import boundary bites both directions", () => {
  assert.deepEqual(
    ruleIdsFor(CHARTS_TO_WEB_STATIC),
    ["no-restricted-imports"],
    "the charts->web violator must be named by the boundary rule, not by anything else",
  );
  assert.deepEqual(
    ruleIdsFor(WEB_TO_CHARTS_STATIC),
    ["no-restricted-imports"],
    "the web->charts violator must be named by the boundary rule, not by anything else",
  );
});

test("D5.12 MORDE (dynamic form): `await import(...)` bites both directions too, closing the ImportExpression gap QA found", () => {
  assert.deepEqual(
    ruleIdsFor(CHARTS_TO_WEB_DYNAMIC),
    ["no-restricted-syntax"],
    "the charts->web dynamic violator must be named by the ImportExpression rule, not by anything else",
  );
  assert.deepEqual(
    ruleIdsFor(WEB_TO_CHARTS_DYNAMIC),
    ["no-restricted-syntax"],
    "the web->charts dynamic violator must be named by the ImportExpression rule, not by anything else",
  );
});

test("D5.12 MORDE (bare template literal): `import(`../charts/x.ts`)` with no interpolation bites both directions", () => {
  assert.deepEqual(
    ruleIdsFor(CHARTS_TO_WEB_TEMPLATE),
    ["no-restricted-syntax"],
    "the charts->web template violator must be named by the boundary rule, not by anything else",
  );
  assert.deepEqual(
    ruleIdsFor(WEB_TO_CHARTS_TEMPLATE),
    ["no-restricted-syntax"],
    "the web->charts template violator must be named by the boundary rule, not by anything else",
  );
});

test("D5.12 MORDE (require form): `require(\"../charts/x.ts\")` bites both directions", () => {
  assert.ok(
    ruleIdsFor(CHARTS_TO_WEB_REQUIRE).includes("no-restricted-syntax"),
    "the charts->web require violator must be named by the boundary rule",
  );
  assert.ok(
    ruleIdsFor(WEB_TO_CHARTS_REQUIRE).includes("no-restricted-syntax"),
    "the web->charts require violator must be named by the boundary rule",
  );
});
