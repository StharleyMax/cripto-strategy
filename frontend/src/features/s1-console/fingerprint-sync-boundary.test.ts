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
//
// CALA of the REAL tree (the 3 existing `import type` consumers stay green) is NOT asserted
// here any more (`T-10.5`, `UNIT-FRONT-analise` §1): it is literally `npm run lint` (`eslint
// src`, `../../../package.json`), which `make lint-frontend` and `scripts/verify.sh` already
// run as a gate of their own. Linting the whole tree here also made this import-boundary test
// fail on UNRELATED lint (mutation F06 turned it red with `ruleId: no-constant-condition` in
// `app/symbol/axis-latency-probe.ts`). The two CONTROL probes above are the cala that is about
// THIS rule, and they stay.
//
// All 4 probes are planted at once, `eslint` runs ONCE over exactly those files, and the
// probes are removed in a `finally`. Every lookup REQUIRES the probe's own entry in the JSON
// output (`ADR-012` vacuity: an ignored or skipped probe must not read as "clean").
//
// `git log --diff-filter=D -- <this file>` staying empty is `F-028-8`'s own falsifier: the gate
// was REWRITTEN when its property changed, never deleted — a deleted instrument and a passing
// one are indistinguishable from `rc=0` alone.
//
// Probe names carry a per-run id, so a concurrent run (or `eslint-boundary.test.ts`, which also
// plants under `src/`) never lints another run's probes.
//
// Run with: npm --prefix frontend run test:s1

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../../..");
const ESLINT_BIN = path.join(FRONTEND_ROOT, "node_modules", ".bin", "eslint");

const RUN_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

function probePath(relativeDir: string, slug: string): string {
  return path.join(FRONTEND_ROOT, relativeDir, `_ephemeral-${slug}-${RUN_ID}.ts`);
}

const SIBLING_VALUE_VIOLATOR = probePath("src/features/s3-inspector", "morde-value-import-sibling");
const SAME_DIR_VALUE_VIOLATOR = probePath("src/features/s1-console", "morde-value-import-same-dir");
const SIBLING_TYPE_CONTROL = probePath("src/features/s3-inspector", "cala-type-import-sibling");
const SIBLING_VALUE_CONTROL_NO_DIRECTIVE = probePath(
  "src/features/s3-inspector",
  "cala-value-import-no-directive-sibling",
);

const ALL_PROBES = [
  SIBLING_VALUE_VIOLATOR,
  SAME_DIR_VALUE_VIOLATOR,
  SIBLING_TYPE_CONTROL,
  SIBLING_VALUE_CONTROL_NO_DIRECTIVE,
] as const;

function removeEphemeralProbes(): void {
  for (const filePath of ALL_PROBES) {
    rmSync(filePath, { force: true });
  }
}

interface LintMessage {
  readonly ruleId: string | null;
}

interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

function runEslintOn(filePaths: readonly string[]): { status: number | null; json: readonly LintResult[] } {
  const result = spawnSync(ESLINT_BIN, ["--format", "json", ...filePaths], {
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
  assert.ok(entry !== undefined, `eslint returned no result for the planted probe ${filePath}`);
  return entry.messages.map((message) => message.ruleId);
}

test(
  "D5.17(b) MORDE+CALA, rewritten by directive: a VALUE import of ingest-health-query.ts in a " +
    '`"use client"` file is refused from both a sibling feature and the same directory, an ' +
    '`import type` probe under `"use client"` stays clean, and a VALUE import WITHOUT the ' +
    "directive (the page.tsx shape) also stays clean — one eslint run over the planted probes only",
  () => {
    for (const filePath of ALL_PROBES) {
      assert.equal(existsSync(filePath), false, `probe path already exists: ${filePath}`);
    }

    let bitten: { status: number | null; json: readonly LintResult[] };
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

      bitten = runEslintOn(ALL_PROBES);
    } finally {
      removeEphemeralProbes();
    }

    assert.equal(
      bitten.status,
      1,
      "eslint must exit 1 on the planted probes — 0 means a real `\"use client\"` value-import " +
        "crossing into ingest-health-query.ts was accepted (the D5.17(b) gate has no teeth), " +
        "2 means eslint itself failed",
    );
    assert.deepEqual(
      bitten.json.map((result) => result.filePath).sort(),
      [...ALL_PROBES].sort(),
      "eslint must lint exactly the planted probes — no more (the real tree is make " +
        "lint-frontend's), no fewer",
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
  },
);
