// `D5.12` ("a fronteira `charts` <-> `web` e EXECUTAVEL — o contrato reprova nas duas
// direcoes"), the two halves of `1.8'` (`ADR-011`, `05_fatia_visivel.md:40`) IN THE SAME
// PASS, against the ESLint boundary rule in `../../eslint.config.mjs`:
//
//   MORDE — plant 2 EPHEMERAL violators, one per direction, and assert `eslint` refuses the
//           run (`rc != 0`), naming the contract (`no-restricted-imports`) on BOTH files.
//   CALA  — remove them and assert the REAL modules in `src/charts/**` and
//           `src/app/**`+`src/features/**` stay green (`rc == 0`) — the exact universe
//           `T-05.1`'s dispatch names, re-measured here (not assumed) via `find`.
//
// This is the `ADR-012` vacuity falsifier the `T-05.1` handoff names explicitly: a
// `forbidden` contract over an empty universe passes with `rc=0` for having nothing to
// reprove — false conformance. MORDE is asserted BEFORE CALA, in the same test run, so a
// rule that silently stopped matching (e.g. a typo'd glob) cannot hide behind a `rc=0` that
// means "nothing violated" instead of "the rule has no teeth".
//
// Ephemeral files are removed in a `finally`, so a failed assertion never leaves a violator
// behind for the next run (or for `git status`) to trip over.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../..");
const ESLINT_BIN = path.join(FRONTEND_ROOT, "node_modules", ".bin", "eslint");

const CHARTS_TO_WEB_VIOLATOR = path.join(FRONTEND_ROOT, "src/charts/_ephemeral-morde-charts-to-web.ts");
const WEB_TO_CHARTS_VIOLATOR = path.join(FRONTEND_ROOT, "src/app/_ephemeral-morde-web-to-charts.ts");

// Dynamic-import (`await import(...)`) counterparts — `no-restricted-imports` (above) only
// registers on `ImportDeclaration`/`ExportNamedDeclaration`/`ExportAllDeclaration`
// (`node_modules/eslint/lib/rules/no-restricted-imports.js:858-864`); it never fires on
// `ImportExpression`, the AST node for `import("...")`. Independent QA found this gap live
// (`docs/context/plataforma-dados/gates/T-05.1-qa.md` §3: `await import("../charts/
// canonical-grid.ts")` from `src/app/` crossed with `rc=0`, `ruleId: []`). Closed with a second
// rule, `no-restricted-syntax` + an `esquery` selector on `ImportExpression`, in
// `../../eslint.config.mjs`. These two probes prove the closure the same way the static ones
// prove the original contract — morde (plant, assert refused) then cala (remove, assert clean).
const CHARTS_TO_WEB_DYNAMIC_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/charts/_ephemeral-morde-charts-to-web-dynamic.ts",
);
const WEB_TO_CHARTS_DYNAMIC_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/app/_ephemeral-morde-web-to-charts-dynamic.ts",
);

// Round-2 QA (`T-05.1-qa.md`, RODADA 2 §2) found the `ImportExpression[source.value=...]`
// selector above only matches a `Literal` source — a bare template literal
// (`import(\`../charts/x.ts\`)`, no interpolation) and `require("../charts/x.ts")` both
// escaped with `rc=0`/`ruleId: []`. Both are closed the SAME way the plain dynamic import
// was: an AST node with a string knowable before the program runs
// (`source.quasis.0.value.cooked` for the bare template, `arguments.0.value` for `require`).
// String concatenation and an INTERPOLATED template literal are declared OUT OF SCOPE in the
// `ADR-003` addendum instead — neither is closable by static analysis, so there is no probe
// for them here; morde+cala only covers what the contract claims to cover.
const CHARTS_TO_WEB_TEMPLATE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/charts/_ephemeral-morde-charts-to-web-template.ts",
);
const WEB_TO_CHARTS_TEMPLATE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/app/_ephemeral-morde-web-to-charts-template.ts",
);
const CHARTS_TO_WEB_REQUIRE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/charts/_ephemeral-morde-charts-to-web-require.ts",
);
const WEB_TO_CHARTS_REQUIRE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/app/_ephemeral-morde-web-to-charts-require.ts",
);

function runEslint(): { status: number | null; json: readonly LintResult[] } {
  const result = spawnSync(ESLINT_BIN, ["src", "--format", "json"], {
    cwd: FRONTEND_ROOT,
    encoding: "utf8",
  });
  // ESLint's own JSON formatter writes to stdout even on `rc=1` (lint errors found) —
  // stdout is empty only if the process failed to run at all (config error, crash), which
  // this parse turns into a loud failure instead of a silent `[]`.
  if (result.stdout.trim().length === 0) {
    throw new Error(
      `eslint produced no stdout (status=${result.status}); stderr: ${result.stderr}`,
    );
  }
  return { status: result.status, json: JSON.parse(result.stdout) as LintResult[] };
}

interface LintMessage {
  readonly ruleId: string | null;
}

interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

function ruleIdsFor(json: readonly LintResult[], filePath: string): readonly (string | null)[] {
  const entry = json.find((result) => result.filePath === filePath);
  return entry === undefined ? [] : entry.messages.map((message) => message.ruleId);
}

const ALL_VIOLATORS = [
  CHARTS_TO_WEB_VIOLATOR,
  WEB_TO_CHARTS_VIOLATOR,
  CHARTS_TO_WEB_DYNAMIC_VIOLATOR,
  WEB_TO_CHARTS_DYNAMIC_VIOLATOR,
  CHARTS_TO_WEB_TEMPLATE_VIOLATOR,
  WEB_TO_CHARTS_TEMPLATE_VIOLATOR,
  CHARTS_TO_WEB_REQUIRE_VIOLATOR,
  WEB_TO_CHARTS_REQUIRE_VIOLATOR,
] as const;

function removeEphemeralViolators(): void {
  for (const filePath of ALL_VIOLATORS) {
    if (existsSync(filePath)) {
      rmSync(filePath);
    }
  }
}

test("D5.12 MORDE+CALA: the charts<->web import boundary bites both directions and stays green on real code", () => {
  // Precondition, re-measured here rather than assumed (the `T-05.1` handoff's own
  // warning: "o universo REAL, nao o de 2026-08-28"): no ephemeral probe survived a
  // previous failed run.
  assert.equal(existsSync(CHARTS_TO_WEB_VIOLATOR), false, "a stale morde probe was left behind — remove it before re-running");
  assert.equal(existsSync(WEB_TO_CHARTS_VIOLATOR), false, "a stale morde probe was left behind — remove it before re-running");

  try {
    // ── MORDE ──────────────────────────────────────────────────────────────────────────
    writeFileSync(
      CHARTS_TO_WEB_VIOLATOR,
      'import { ROUTES } from "../app/routes.ts";\nexport const probe = ROUTES;\n',
    );
    writeFileSync(
      WEB_TO_CHARTS_VIOLATOR,
      'import { buildCanonicalGrid } from "../charts/canonical-grid.ts";\nexport const probe = buildCanonicalGrid;\n',
    );

    const bitten = runEslint();
    assert.notEqual(bitten.status, 0, "eslint accepted a real cross-boundary import — the contract has no teeth");
    assert.deepEqual(
      ruleIdsFor(bitten.json, CHARTS_TO_WEB_VIOLATOR),
      ["no-restricted-imports"],
      "the charts->web violator must be named by the boundary rule, not by anything else",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, WEB_TO_CHARTS_VIOLATOR),
      ["no-restricted-imports"],
      "the web->charts violator must be named by the boundary rule, not by anything else",
    );
  } finally {
    removeEphemeralViolators();
  }

  // ── CALA ─────────────────────────────────────────────────────────────────────────────
  // Re-measure the real universe now, not the one `T-05.1`'s handoff quoted from
  // 2026-08-28 — `find` over the exact two trees the dispatch names.
  const chartsFiles = readdirSync(path.join(FRONTEND_ROOT, "src/charts")).filter((name) =>
    /\.(ts|tsx)$/.test(name),
  );
  const appFiles = readdirSync(path.join(FRONTEND_ROOT, "src/app")).filter((name) => /\.(ts|tsx)$/.test(name));
  assert.ok(chartsFiles.length > 0, "src/charts has no real files — the cala side would be vacuous");
  assert.ok(appFiles.length > 0, "src/app has no real files — the cala side would be vacuous");

  const clean = runEslint();
  assert.equal(
    clean.status,
    0,
    `eslint reported errors on real code after the ephemeral violators were removed: ${JSON.stringify(clean.json)}`,
  );
});

test("D5.12 MORDE+CALA (dynamic form): `await import(...)` bites both directions too, closing the ImportExpression gap QA found", () => {
  assert.equal(
    existsSync(CHARTS_TO_WEB_DYNAMIC_VIOLATOR),
    false,
    "a stale dynamic morde probe was left behind — remove it before re-running",
  );
  assert.equal(
    existsSync(WEB_TO_CHARTS_DYNAMIC_VIOLATOR),
    false,
    "a stale dynamic morde probe was left behind — remove it before re-running",
  );

  try {
    // ── MORDE ──────────────────────────────────────────────────────────────────────────
    // Same shape as the static probes above, but through `import(...)` instead of a static
    // `import`/`export … from` declaration — the exact form `no-restricted-imports` cannot
    // see (it never registers a listener for `ImportExpression`).
    writeFileSync(
      CHARTS_TO_WEB_DYNAMIC_VIOLATOR,
      'export async function probe() {\n  return await import("../app/routes.ts");\n}\n',
    );
    writeFileSync(
      WEB_TO_CHARTS_DYNAMIC_VIOLATOR,
      'export async function probe() {\n  return await import("../charts/canonical-grid.ts");\n}\n',
    );

    const bitten = runEslint();
    assert.notEqual(
      bitten.status,
      0,
      "eslint accepted a real cross-boundary DYNAMIC import — the ImportExpression gap is still open",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, CHARTS_TO_WEB_DYNAMIC_VIOLATOR),
      ["no-restricted-syntax"],
      "the charts->web dynamic violator must be named by the ImportExpression rule, not by anything else",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, WEB_TO_CHARTS_DYNAMIC_VIOLATOR),
      ["no-restricted-syntax"],
      "the web->charts dynamic violator must be named by the ImportExpression rule, not by anything else",
    );
  } finally {
    removeEphemeralViolators();
  }

  // ── CALA ─────────────────────────────────────────────────────────────────────────────
  // The real code under `src/charts` and `src/app`/`src/features` contains zero dynamic
  // imports today (this task does not mount any chart) — the ImportExpression selector must
  // not fire on anything ELSE in those trees (e.g. a legitimate `await import("node:fs")` or
  // similar), or it would be a false-positive machine, not a boundary.
  const clean = runEslint();
  assert.equal(
    clean.status,
    0,
    `eslint reported errors on real code after the dynamic ephemeral violators were removed: ${JSON.stringify(clean.json)}`,
  );
});

test("D5.12 MORDE+CALA (bare template literal): `import(`../charts/x.ts`)` with no interpolation bites both directions", () => {
  assert.equal(existsSync(CHARTS_TO_WEB_TEMPLATE_VIOLATOR), false, "a stale template morde probe was left behind — remove it before re-running");
  assert.equal(existsSync(WEB_TO_CHARTS_TEMPLATE_VIOLATOR), false, "a stale template morde probe was left behind — remove it before re-running");

  try {
    // ── MORDE ──────────────────────────────────────────────────────────────────────────
    // Round-2 QA's exact bypass shape: a template literal with `expressions.length === 0` —
    // the whole path is known statically (`quasis[0].cooked`), but `no-restricted-syntax`'s
    // `ImportExpression[source.value=...]` selector only reads `.value`, which a
    // `TemplateLiteral` node does not have.
    writeFileSync(
      CHARTS_TO_WEB_TEMPLATE_VIOLATOR,
      "export async function probe() {\n  return await import(`../app/routes.ts`);\n}\n",
    );
    writeFileSync(
      WEB_TO_CHARTS_TEMPLATE_VIOLATOR,
      "export async function probe() {\n  return await import(`../charts/canonical-grid.ts`);\n}\n",
    );

    const bitten = runEslint();
    assert.notEqual(
      bitten.status,
      0,
      "eslint accepted a real cross-boundary bare-template-literal import — the gap QA found is still open",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, CHARTS_TO_WEB_TEMPLATE_VIOLATOR),
      ["no-restricted-syntax"],
      "the charts->web template violator must be named by the boundary rule, not by anything else",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, WEB_TO_CHARTS_TEMPLATE_VIOLATOR),
      ["no-restricted-syntax"],
      "the web->charts template violator must be named by the boundary rule, not by anything else",
    );
  } finally {
    removeEphemeralViolators();
  }

  // ── CALA ─────────────────────────────────────────────────────────────────────────────
  const clean = runEslint();
  assert.equal(
    clean.status,
    0,
    `eslint reported errors on real code after the template ephemeral violators were removed: ${JSON.stringify(clean.json)}`,
  );
});

test("D5.12 MORDE+CALA (require form): `require(\"../charts/x.ts\")` bites both directions", () => {
  assert.equal(existsSync(CHARTS_TO_WEB_REQUIRE_VIOLATOR), false, "a stale require morde probe was left behind — remove it before re-running");
  assert.equal(existsSync(WEB_TO_CHARTS_REQUIRE_VIOLATOR), false, "a stale require morde probe was left behind — remove it before re-running");

  try {
    // ── MORDE ──────────────────────────────────────────────────────────────────────────
    // `no-restricted-imports` never registers a `CallExpression` listener (`grep -c
    // CallExpression node_modules/eslint/lib/rules/no-restricted-imports.js` -> 0), so
    // `require(...)` needed its own `no-restricted-syntax` selector, not an extension of an
    // existing rule.
    writeFileSync(
      CHARTS_TO_WEB_REQUIRE_VIOLATOR,
      'const routes = require("../app/routes.ts");\nexport { routes };\n',
    );
    writeFileSync(
      WEB_TO_CHARTS_REQUIRE_VIOLATOR,
      'const grid = require("../charts/canonical-grid.ts");\nexport { grid };\n',
    );

    const bitten = runEslint();
    assert.notEqual(
      bitten.status,
      0,
      "eslint accepted a real cross-boundary require() — the gap QA found is still open",
    );
    assert.ok(
      ruleIdsFor(bitten.json, CHARTS_TO_WEB_REQUIRE_VIOLATOR).includes("no-restricted-syntax"),
      "the charts->web require violator must be named by the boundary rule",
    );
    assert.ok(
      ruleIdsFor(bitten.json, WEB_TO_CHARTS_REQUIRE_VIOLATOR).includes("no-restricted-syntax"),
      "the web->charts require violator must be named by the boundary rule",
    );
  } finally {
    removeEphemeralViolators();
  }

  // ── CALA ─────────────────────────────────────────────────────────────────────────────
  const clean = runEslint();
  assert.equal(
    clean.status,
    0,
    `eslint reported errors on real code after the require ephemeral violators were removed: ${JSON.stringify(clean.json)}`,
  );
});
