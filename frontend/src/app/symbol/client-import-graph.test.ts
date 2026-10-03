/**
 * `estrutura-do-front` `T-03.3` — the STATIC value-import graph of `SymbolClient.tsx` (the client
 * entry of `/symbol/[symbol]`) reaches no `node:*` builtin.
 *
 * Why now: `T-03.3` makes `SymbolClient.tsx` import `indicators/catalog.ts`, whose predicates come
 * from `view-model.ts`. Until this task `view-model.ts` re-exported `computeSeriesKeyId` from
 * `series-key-id.ts` (`node:crypto`), so the client graph reached `node:crypto` — already through
 * `use-history-pager.ts → panel-assembly.ts → view-model.ts`, and the catalog would have been a
 * second path. The bundle stayed clean only because the bundler drops the unused re-export
 * (`"sideEffects": false`; `createHash` absent from the chunk, `gates/T-03.3-build.md`). The
 * re-export is gone, and this test holds the graph, so the client no longer depends on that.
 *
 * `volume-subaxis-dom-contract.test.ts` already refuses a `node:` or `view-model` import written
 * IN the client files; this one follows the imports, transitively. It parses with TypeScript (a
 * regex would read import-shaped text in comments), skips type-only imports (erased), and does not
 * descend into packages.
 *
 * ⚠️ Declared, not asserted: the graph reaches the package `jsdom`, through the `charts` barrel
 * (`charts/headless-chart.ts`, `charts/s2-headless-run.ts`) — pre-existing, dropped by the same
 * tree-shaking, and outside this task.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "..");
const ENTRY = path.join(HERE, "SymbolClient.tsx");

/** The value specifiers of one parsed file: imports and re-exports that survive type erasure. */
function specifiersOf(source: ReturnType<typeof ts.createSourceFile>): readonly string[] {
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const named = clause?.namedBindings;
      const onlyTypes =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            named !== undefined &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((element) => element.isTypeOnly)));
      if (!onlyTypes) {
        specifiers.push(statement.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !statement.isTypeOnly
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function valueSpecifiers(file: string): readonly string[] {
  return specifiersOf(ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true));
}

interface Graph {
  /** Every source file reached, relative to `src/`, with the chain that reached it. */
  readonly files: ReadonlyMap<string, readonly string[]>;
  /** Every non-relative specifier reached, with the chain of the first file that imports it. */
  readonly external: ReadonlyMap<string, readonly string[]>;
}

function walk(entry: string): Graph {
  const files = new Map<string, readonly string[]>();
  const external = new Map<string, readonly string[]>();
  const visit = (file: string, chain: readonly string[]): void => {
    const name = path.relative(SRC, file);
    if (files.has(name)) {
      return;
    }
    const here = [...chain, name];
    files.set(name, here);
    for (const specifier of valueSpecifiers(file)) {
      if (!specifier.startsWith(".")) {
        if (!external.has(specifier)) {
          external.set(specifier, here);
        }
        continue;
      }
      const target = path.resolve(path.dirname(file), specifier);
      assert.ok(existsSync(target), `${name}: the import ${specifier} does not resolve to a file — the walk would go blind`);
      visit(target, here);
    }
  };
  visit(entry, []);
  return { files, external };
}

test("the client graph of SymbolClient.tsx reaches no Node builtin (node:-prefixed or bare)", () => {
  const graph = walk(ENTRY);
  // Anchors: the walk reaches the two paths that used to lead to `node:crypto`, so a green here is
  // not an empty walk.
  for (const anchor of ["app/symbol/indicators/catalog.ts", "app/symbol/panel-assembly.ts", "app/symbol/view-model.ts"]) {
    assert.ok(graph.files.has(anchor), `the walk no longer reaches ${anchor} (${graph.files.size} files)`);
  }
  const builtins = [...graph.external].filter(([specifier]) => isBuiltin(specifier));
  assert.deepEqual(
    builtins.map(([specifier, chain]) => `${specifier} <- ${chain.join(" -> ")}`),
    [],
    "a client-graph module imports a Node builtin",
  );
  assert.ok(!graph.files.has("app/symbol/series-key-id.ts"), `series-key-id.ts reached: ${graph.files.get("app/symbol/series-key-id.ts")?.join(" -> ")}`);
});

test("MORDE: the parser follows re-exports and skips type-only imports and comments", () => {
  const text = [
    'import type { A } from "./type-only-a.ts";',
    'import { type B } from "./type-only-b.ts";',
    'import { c, type D } from "./value-c.ts";',
    'export { e } from "./reexport-e.ts";',
    'export type { F } from "./type-only-f.ts";',
    'import "./side-effect-g.ts";',
    '// import { h } from "./in-a-comment.ts";',
  ].join("\n");
  const source = ts.createSourceFile("probe.ts", text, ts.ScriptTarget.ES2022, true);
  assert.deepEqual(specifiersOf(source), ["./value-c.ts", "./reexport-e.ts", "./side-effect-g.ts"]);
});
