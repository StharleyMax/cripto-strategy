// `D5.17(b)` (`T-01.2`, `ADR-028/D3`) — the import gate that keeps `fingerprint()` the ONE
// synchronous canonicalization path (`ADR-005/D6.3`+`D6.4`), REWRITTEN by directive instead of
// by file path. Against the ESLint rule in `../../eslint.config.mjs`
// (`local/use-client-fingerprint-boundary`, `../../eslint-rules/use-client-fingerprint-
// boundary.mjs`):
//
//   MORDE (i)  — plant an EPHEMERAL `"use client"` probe with a VALUE-import violator reaching
//                into `ingest-health-query.ts` from a sibling feature (`../s1-console/…`, the
//                shape 3/3 real importers already use) and assert `eslint` refuses the run
//                (`rc != 0`), naming the contract on that file.
//   MORDE (ii) — same, but same-directory form (`./ingest-health-query.ts`), the OTHER half of
//                `D5.17(b)`'s own `grep` pattern (`'from "\(\.\./s1-console/\|\./\)…'`).
//   CONTROL (type)      — a `"use client"` probe with an `import type`-only ephemeral probe,
//                         same target, must stay CLEAN — proves the gate distinguishes type
//                         from value instead of just rejecting every mention of the module.
//   CONTROL (no directive, value) — an ephemeral probe WITHOUT `"use client"` that VALUE-imports
//                         the SAME target must ALSO stay CLEAN — this is the property
//                         `ADR-028/D3` rewrote the rule FOR: `T-01.4`'s `page.tsx` (a Server
//                         Component, no directive) needs exactly this import, and the
//                         predecessor rule forbade it. If this probe is flagged, the rewrite
//                         regressed to the old, path-keyed behaviour it replaced.
//   CALA       — remove all probes and assert the REAL tree (the 3 existing `import type`
//                consumers) stays green.
//
// This is the `ADR-012` vacuity falsifier the `T-05.1`/`D5.12` precedent established: MORDE is
// asserted BEFORE CALA in the same run, so a rule that silently stopped matching cannot hide
// behind a `rc=0` that means "nothing violated" instead of "the rule has no teeth".
//
// `git log --diff-filter=D -- <this file>` staying empty is `F-028-8`'s own falsifier: the gate
// was REWRITTEN when its property changed, never deleted — a deleted instrument and a passing
// one are indistinguishable from `rc=0` alone.
//
// Ephemeral files are removed in a `finally`, so a failed assertion never leaves a violator
// behind for the next run (or for `git status`) to trip over.
//
// Run with: npm --prefix frontend run test:s1

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../../..");
const ESLINT_BIN = path.join(FRONTEND_ROOT, "node_modules", ".bin", "eslint");

const SIBLING_VALUE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/features/s3-inspector/_ephemeral-morde-value-import-sibling.ts",
);
const SAME_DIR_VALUE_VIOLATOR = path.join(
  FRONTEND_ROOT,
  "src/features/s1-console/_ephemeral-morde-value-import-same-dir.ts",
);
const SIBLING_TYPE_CONTROL = path.join(
  FRONTEND_ROOT,
  "src/features/s3-inspector/_ephemeral-cala-type-import-sibling.ts",
);
const SIBLING_VALUE_CONTROL_NO_DIRECTIVE = path.join(
  FRONTEND_ROOT,
  "src/features/s3-inspector/_ephemeral-cala-value-import-no-directive-sibling.ts",
);

const ALL_PROBES = [
  SIBLING_VALUE_VIOLATOR,
  SAME_DIR_VALUE_VIOLATOR,
  SIBLING_TYPE_CONTROL,
  SIBLING_VALUE_CONTROL_NO_DIRECTIVE,
] as const;

function removeEphemeralProbes(): void {
  for (const filePath of ALL_PROBES) {
    if (existsSync(filePath)) {
      rmSync(filePath);
    }
  }
}

interface LintMessage {
  readonly ruleId: string | null;
}

interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

function runEslint(): { status: number | null; json: readonly LintResult[] } {
  const result = spawnSync(ESLINT_BIN, ["src", "--format", "json"], {
    cwd: FRONTEND_ROOT,
    encoding: "utf8",
  });
  // ESLint's own JSON formatter writes to stdout even on `rc=1` (lint errors found) —
  // stdout is empty only if the process failed to run at all (config error, crash), which
  // this parse turns into a loud failure instead of a silent `[]`.
  if (result.stdout.trim().length === 0) {
    throw new Error(`eslint produced no stdout (status=${result.status}); stderr: ${result.stderr}`);
  }
  return { status: result.status, json: JSON.parse(result.stdout) as LintResult[] };
}

function ruleIdsFor(json: readonly LintResult[], filePath: string): readonly (string | null)[] {
  const entry = json.find((result) => result.filePath === filePath);
  return entry === undefined ? [] : entry.messages.map((message) => message.ruleId);
}

test(
  "D5.17(b) MORDE+CALA, rewritten by directive: a VALUE import of ingest-health-query.ts in a " +
    '`"use client"` file is refused from both a sibling feature and the same directory, an ' +
    '`import type` probe under `"use client"` stays clean, a VALUE import WITHOUT the directive ' +
    "(the page.tsx shape) also stays clean, and the real tree (3/3 import type) stays green",
  () => {
    for (const filePath of ALL_PROBES) {
      assert.equal(existsSync(filePath), false, `a stale probe was left behind: ${filePath}`);
    }

    try {
      // ── MORDE (i): sibling feature, "use client" + value import ───────────────────────────
      writeFileSync(
        SIBLING_VALUE_VIOLATOR,
        '"use client";\n' +
          'import { fingerprint } from "../s1-console/ingest-health-query.ts";\n' +
          "export const probe = fingerprint;\n",
      );
      // ── MORDE (ii): same-directory, "use client" + value import ───────────────────────────
      writeFileSync(
        SAME_DIR_VALUE_VIOLATOR,
        '"use client";\n' +
          'import { canonicalProjection } from "./ingest-health-query.ts";\n' +
          "export const probe = canonicalProjection;\n",
      );
      // ── CONTROL (type): "use client" + import type only — must NOT be reported ────────────
      writeFileSync(
        SIBLING_TYPE_CONTROL,
        '"use client";\n' +
          'import type { IngestHealthProjection } from "../s1-console/ingest-health-query.ts";\n' +
          "export type Probe = IngestHealthProjection;\n",
      );
      // ── CONTROL (no directive, value): the page.tsx shape — must NOT be reported ───────────
      writeFileSync(
        SIBLING_VALUE_CONTROL_NO_DIRECTIVE,
        'import { fingerprint } from "../s1-console/ingest-health-query.ts";\n' +
          "export const probe = fingerprint;\n",
      );

      const bitten = runEslint();
      assert.notEqual(
        bitten.status,
        0,
        "eslint accepted a real `\"use client\"` value-import crossing into " +
          "ingest-health-query.ts — the D5.17(b) gate has no teeth",
      );
      assert.deepEqual(
        ruleIdsFor(bitten.json, SIBLING_VALUE_VIOLATOR),
        ["local/use-client-fingerprint-boundary"],
        "the sibling-directory `use client` value-import violator must be named by the " +
          "D5.17(b) rule, not by anything else",
      );
      assert.deepEqual(
        ruleIdsFor(bitten.json, SAME_DIR_VALUE_VIOLATOR),
        ["local/use-client-fingerprint-boundary"],
        "the same-directory `use client` value-import violator must be named by the D5.17(b) " +
          "rule, not by anything else",
      );
      assert.deepEqual(
        ruleIdsFor(bitten.json, SIBLING_TYPE_CONTROL),
        [],
        "an `import type`-only probe against the SAME target, even under `\"use client\"`, " +
          "must stay clean — the gate must distinguish type from value, not reject every " +
          "mention of the module",
      );
      assert.deepEqual(
        ruleIdsFor(bitten.json, SIBLING_VALUE_CONTROL_NO_DIRECTIVE),
        [],
        "a VALUE import WITHOUT the `\"use client\"` directive (the page.tsx / Server " +
          "Component shape) must stay clean — this is the exact property ADR-028/D3 rewrote " +
          "the rule for; next build's server-only enforcement is the judge for anything this " +
          "case still needs to catch, not this ESLint rule",
      );
    } finally {
      removeEphemeralProbes();
    }

    // ── CALA ─────────────────────────────────────────────────────────────────────────────
    // Re-measure the real universe now, not a number quoted from an earlier commit: the 3
    // `import type` consumers this DoD's own `grep` names
    // (`s3-inspector/{fixtures,domain,view-model}.ts`), plus `S1Console.tsx`, which imports
    // only `S1ViewModel` from `./view-model.ts` (no direct edge to `ingest-health-query.ts`
    // at all) — both facts asserted here so a future edit that adds a 4th importer, or that
    // makes `S1Console.tsx` import the module directly, is caught by THIS test, not assumed.
    const realValueImporters = [
      path.join(FRONTEND_ROOT, "src/features/s3-inspector/fixtures.ts"),
      path.join(FRONTEND_ROOT, "src/features/s3-inspector/domain.ts"),
      path.join(FRONTEND_ROOT, "src/features/s3-inspector/view-model.ts"),
    ];
    for (const filePath of realValueImporters) {
      assert.ok(existsSync(filePath), `expected real importer is missing: ${filePath}`);
    }

    const clean = runEslint();
    assert.equal(
      clean.status,
      0,
      `eslint reported errors on real code after the ephemeral probes were removed: ${JSON.stringify(clean.json)}`,
    );
  },
);
