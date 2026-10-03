#!/usr/bin/env node
// scope-graph.mjs — the import graph of `frontend/`, read by `scripts/scope-resolve.sh` (`T-06.2`).
//
// It answers ONE question per changed file: which Next entry files and which e2e specs reach it.
// It decides nothing about the selection — the rules live in `scope-resolve.sh`, next to the map.
//
// WHY A GRAPH AND NOT ONLY THE HAND-WRITTEN MAP `[MEDIDO 2026-10-02]`: the design proposed
// `src/features/s1-console/ => 01-07`, and `src/app/symbol/series-history-client.ts` imports from
// `features/s1-console/` — a console-only row would have shrunk the symbol specs out of a diff that
// reaches the symbol route. A map row cannot see an import that appears after it was written; a graph
// computed on every run can.
//
// WHAT COUNTS AS AN EDGE, and the over-approximation is deliberate (a superset only costs time):
//   - every relative `import … from "./x"`, `export … from "./x"`, `import "./x"`, `import("./x")`,
//     type-only imports included (erased at run time, but a superset is the safe side);
//   - inside `frontend/e2e/`, a MENTION of another e2e file's name (`path.resolve(HERE,
//     "liquidation-pane-fixture.ts")` spawns a fixture by path, not by import).
// The repository has no path alias (`tsconfig.json` has no `paths`), so relative is the only form.
//
// OUTPUT, one line per argument (path relative to the repository root), tab-separated:
//   <path> \t <exists 0|1> \t <entries reaching it, comma> \t <specs reaching it, comma>
// An entry/spec reaches itself. Exit 3 when `frontend/` is not where it should be.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRONT = path.join(ROOT, "frontend");
if (!fs.existsSync(path.join(FRONT, "src")) || !fs.existsSync(path.join(FRONT, "e2e"))) {
  console.error(`RECUSA: ${FRONT}/src ou ${FRONT}/e2e ausente — rode a partir da raiz do repositório`);
  process.exit(3);
}

const SOURCE = /\.(ts|tsx|mts|js|mjs|jsx)$/;
// Next's special files under `app/` are the roots the server renders from; `middleware`/
// `instrumentation` sit at `src/`. Anything reachable from one of them can change what is painted.
const NEXT_SPECIAL = /^(page|layout|template|default|error|global-error|loading|not-found|route)\.(tsx?|jsx?)$/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

const files = [...walk(path.join(FRONT, "src"), []), ...walk(path.join(FRONT, "e2e"), [])];
const fileSet = new Set(files);
const rel = (abs) => path.relative(ROOT, abs);

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
    path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((c) => fileSet.has(c));
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;
const e2eDir = path.join(FRONT, "e2e");
const e2eNames = files.filter((f) => path.dirname(f) === e2eDir && SOURCE.test(f))
  .map((f) => [path.basename(f), f]);

// reverse[x] = files that depend on x
const reverse = new Map(files.map((f) => [f, new Set()]));
for (const file of files) {
  if (!SOURCE.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT)) {
    const target = resolveImport(file, m[1]);
    if (target && target !== file) reverse.get(target).add(file);
  }
  if (path.dirname(file) === e2eDir) {
    for (const [name, target] of e2eNames) {
      // The FULL name, extension included: the stem alone (`view`) is an English word and would
      // make every file that says "view" depend on `view.ts`. Imports without extension are already
      // edges through `IMPORT`; this clause exists only for files spawned by path.
      if (target !== file && text.includes(name)) reverse.get(target).add(file);
    }
  }
}

const isEntry = (f) => {
  const r = path.relative(path.join(FRONT, "src"), f);
  if (r.startsWith("..")) return false;
  if (/^(middleware|instrumentation)\.(ts|js)$/.test(r)) return true;
  return r.startsWith(`app${path.sep}`) && NEXT_SPECIAL.test(path.basename(f));
};
const isSpec = (f) => path.dirname(f) === e2eDir && f.endsWith(".spec.ts");

for (const arg of process.argv.slice(2)) {
  const abs = path.resolve(ROOT, arg);
  if (!fileSet.has(abs)) {
    process.stdout.write(`${arg}\t0\t\t\n`);
    continue;
  }
  const seen = new Set([abs]);
  const queue = [abs];
  while (queue.length) {
    for (const dep of reverse.get(queue.pop()) ?? []) {
      if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
    }
  }
  const entries = [...seen].filter(isEntry).map(rel).sort();
  const specs = [...seen].filter(isSpec).map(rel).sort();
  process.stdout.write(`${arg}\t1\t${entries.join(",")}\t${specs.join(",")}\n`);
}
