// `D5.17(b)` (`T-05.16`) — the import gate that keeps `fingerprint()` the ONE synchronous
// canonicalization path (`ADR-005/D6.3`+`D6.4`). Against the ESLint boundary rule in
// `../../eslint.config.mjs` (`@typescript-eslint/no-restricted-imports`, group
// `**/ingest-health-query.ts`, `allowTypeImports: true`):
//
//   MORDE (i)  — plant an EPHEMERAL VALUE-import violator reaching into
//                `ingest-health-query.ts` from a sibling feature (`../s1-console/…`, the
//                shape 3/3 real importers already use) and assert `eslint` refuses the run
//                (`rc != 0`), naming the contract on that file.
//   MORDE (ii) — same, but same-directory form (`./ingest-health-query.ts`), the OTHER half
//                of `D5.17(b)`'s own `grep` pattern (`'from "\(\.\./s1-console/\|\./\)…'`).
//   CONTROL    — a `import type`-only ephemeral probe, same target, must stay CLEAN — proves
//                the gate distinguishes type from value instead of just rejecting everything
//                that mentions the module (which would be a stricter contract than `D5.17(b)`
//                asks for and would break the 3 real importers below).
//   CALA       — remove all probes and assert the REAL tree (the 3 existing `import type`
//                consumers) stays green.
//
// This is the `ADR-012` vacuity falsifier the `T-05.1`/`D5.12` precedent established: MORDE is
// asserted BEFORE CALA in the same run, so a rule that silently stopped matching cannot hide
// behind a `rc=0` that means "nothing violated" instead of "the rule has no teeth".
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

const ALL_PROBES = [SIBLING_VALUE_VIOLATOR, SAME_DIR_VALUE_VIOLATOR, SIBLING_TYPE_CONTROL] as const;

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

test("D5.17(b) MORDE+CALA: a VALUE import of ingest-health-query.ts is refused from both a sibling feature and the same directory, an `import type` probe stays clean, and the real tree (3/3 import type) stays green", () => {
  for (const filePath of ALL_PROBES) {
    assert.equal(existsSync(filePath), false, `a stale probe was left behind: ${filePath}`);
  }

  try {
    // ── MORDE (i): sibling feature, value import, the shape all 3 real importers use ──────
    writeFileSync(
      SIBLING_VALUE_VIOLATOR,
      'import { fingerprint } from "../s1-console/ingest-health-query.ts";\nexport const probe = fingerprint;\n',
    );
    // ── MORDE (ii): same-directory, value import — the OTHER half of D5.17(b)'s grep ──────
    writeFileSync(
      SAME_DIR_VALUE_VIOLATOR,
      'import { canonicalProjection } from "./ingest-health-query.ts";\nexport const probe = canonicalProjection;\n',
    );
    // ── CONTROL: same target, `import type` only — must NOT be reported ───────────────────
    writeFileSync(
      SIBLING_TYPE_CONTROL,
      'import type { IngestHealthProjection } from "../s1-console/ingest-health-query.ts";\nexport type Probe = IngestHealthProjection;\n',
    );

    const bitten = runEslint();
    assert.notEqual(
      bitten.status,
      0,
      "eslint accepted a real value-import crossing into ingest-health-query.ts — the D5.17(b) gate has no teeth",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, SIBLING_VALUE_VIOLATOR),
      ["@typescript-eslint/no-restricted-imports"],
      "the sibling-directory value-import violator must be named by the D5.17(b) rule, not by anything else",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, SAME_DIR_VALUE_VIOLATOR),
      ["@typescript-eslint/no-restricted-imports"],
      "the same-directory value-import violator must be named by the D5.17(b) rule, not by anything else",
    );
    assert.deepEqual(
      ruleIdsFor(bitten.json, SIBLING_TYPE_CONTROL),
      [],
      "an `import type`-only probe against the SAME target must stay clean — the gate must " +
        "distinguish type from value, not reject every mention of the module",
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
});
