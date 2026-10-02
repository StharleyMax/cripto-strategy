/**
 * `SPEC-011` §5.4 (`estrutura-do-front` `T-00.3`, `RF-7`, `CA-4`) — every DIRECTORY immediately
 * below `frontend/src/` is one of `{app, charts, components, features}`.
 *
 * WHY THIS FILE EXISTS. `ADR-050` puts each indicator in its own module under
 * `src/app/symbol/indicators/<kind>/`. The cheapest way to dodge the isolation rule that ships
 * with it (`local/indicator-isolation`, scoped by path) is to start a new top-level tree —
 * `src/indicators/`, `src/lib/`, `src/shared/` — where no scope reaches. This test closes that
 * exit: a new top-level directory is a decision written here, in review, not a side effect.
 *
 * ⚠️ THE ALLOWED SET IS A LITERAL, NEVER READ FROM DISK. A list derived from `readdirSync` agrees
 * with whatever is on disk by construction, so a planted `src/indicators/` would be "allowed" the
 * moment it exists — the test would pass on every tree, which is the failure mode the ablation of
 * `T-00.3` names. The pin test below holds the literal to the four names `SPEC-011` §5.4 fixed.
 *
 * FILES at the top of `src/` are OUT of the universe on purpose: `ADR-048/D8` creates
 * `frontend/src/proxy.ts`, a Next convention that has to live there (`G-J`).
 * Measured when written: 4 directories, 0 files [MEDIDO 2026-10-02: `ls frontend/src`].
 *
 * Paths resolved from `fileURLToPath`, never from `cwd`.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The closed set, `SPEC-011` §5.4. Growing it is an architecture decision, not a test edit. */
const ALLOWED_TOP_LEVEL_DIRECTORIES: ReadonlySet<string> = new Set(["app", "charts", "components", "features"]);

/** The directories in `names` that are not in the closed set, sorted. Pure, so the bite can be
 * proven on a synthetic listing without planting anything on disk. */
function unexpectedDirectories(names: readonly string[]): string[] {
  return names.filter((name) => !ALLOWED_TOP_LEVEL_DIRECTORIES.has(name)).sort();
}

/** The names of the DIRECTORIES among `entries` — files dropped. Pure for the same reason. */
function directoryNames(entries: readonly { readonly name: string; isDirectory(): boolean }[]): string[] {
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function topLevelDirectoriesOnDisk(): string[] {
  return directoryNames(readdirSync(SRC_DIR, { withFileTypes: true }));
}

test("CA-4: every directory directly under frontend/src/ is in {app, charts, components, features}", () => {
  const onDisk = topLevelDirectoriesOnDisk();
  assert.ok(onDisk.includes("app"), `SRC_DIR resolved to the wrong place (${SRC_DIR}): no app/ in ${JSON.stringify(onDisk)}`);
  assert.deepEqual(
    unexpectedDirectories(onDisk),
    [],
    `a top-level directory outside the closed set appeared under frontend/src/ (SPEC-011 §5.4) — ` +
      `put the code under one of ${JSON.stringify([...ALLOWED_TOP_LEVEL_DIRECTORIES])}`,
  );
});

test("pin: the allowed set is exactly the four names SPEC-011 §5.4 fixed — a literal, not the disk", () => {
  assert.deepEqual([...ALLOWED_TOP_LEVEL_DIRECTORIES].sort(), ["app", "charts", "components", "features"]);
});

test("MORDE: a new top-level tree — the escape from the isolation scope — is rejected", () => {
  for (const escape of ["indicators", "lib", "shared"]) {
    assert.deepEqual(
      unexpectedDirectories(["app", "charts", "components", "features", escape]),
      [escape],
      `src/${escape}/ would pass the gate — it is decoration`,
    );
  }
});

test("CALA: a top-level FILE is out of the universe — proxy.ts (ADR-048/D8) must stay writable", () => {
  const entry = (name: string, directory: boolean) => ({ name, isDirectory: () => directory });
  const listing = [entry("app", true), entry("charts", true), entry("proxy.ts", false), entry("indicators", true)];
  // The file is dropped before the check; the directory next to it is still caught.
  assert.deepEqual(unexpectedDirectories(directoryNames(listing)), ["indicators"]);
});
