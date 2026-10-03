// `ADR-050/D6` + `SPEC-011 §5.2/§5.3` (`T-00.2`) — `local/indicator-isolation`: an indicator is an
// ISOLATED module under `src/app/symbol/indicators/<kind>/`, and this rule is the gate that keeps it
// so. It resolves the PATH of every module reference — `import`, `export … from`, `export * from`,
// `import()`, `require()`, `import x = require()` and the type-position `import("…")` — and never
// matches the specifier STRING.
//
// WHY A LOCAL RULE AND NOT `no-restricted-imports` (`ADR-050/D6`, measured in the study §4.3):
//   1. `no-restricted-imports` matches the literal specifier (gitignore patterns), not the resolved
//      path: `../cvd/x`, `../../indicators/cvd/x` and a future alias are three spellings of the
//      same crossing, and a pattern like `../*/**` would ALSO match `../../chart/…`.
//   2. In flat config the LAST block matching file+rule REPLACES the options (`eslint.config.mjs`,
//      the `ADR-034/D8` block). A new `no-restricted-imports` block for `indicators/**` would
//      silently erase the barrel patterns inside that folder. A rule with its own id cannot.
//
// ── The dependency table (`SPEC-011 §5.1` = study §4.2) — the WHOLE table, for the reader ──────
//
//   from \ to                    | chart/** | chrome/** | contract.ts | own <a>/** | other <b>/** | catalog.ts, selection/** | charts barrel
//   -----------------------------+----------+-----------+-------------+------------+--------------+--------------------------+--------------
//   indicators/<a>/**            |   yes    |    no     |     yes     |    yes     |   NO (P1)    |      NO (P1, cycle)      | yes (ADR-034/D8)
//   chart/**, chrome/**          |   yes    |    yes    |   NO (P2)   |  NO (P2)   |   NO (P2)    |         NO (P2)          | yes
//   indicators/catalog.ts        |   yes    |     —     |     yes     | yes (all)  |  yes (all)   |            —             | —
//   SymbolClient/page/layout.tsx |   yes    |    yes    |     yes     |  NO (P3)   |   NO (P3)    |           yes            | yes
//
// ── What THIS rule enforces: exactly the three prohibitions of `SPEC-011 §5.3` (`G-A`) ─────────
//
//   P1  from `indicators/<a>/**` to `indicators/<b>/**` (b ≠ a), `indicators/catalog.ts` or
//       `indicators/selection/**` — and, closing the root detour, to `indicators/` itself
//       (`import ".."`) and to any other file at its root (`W-F0-QA` W3).
//   P2  from `chart/**` or `chrome/**` to anything under `indicators/**`, `contract.ts` included
//       (`G-R`: the core receives the definitions as an ARGUMENT, it never names them).
//   P3  from any file OUTSIDE `indicators/<kind>/` that is not `indicators/catalog.ts` to
//       `indicators/<kind>/**` — `CA-6` as a gate. This includes files outside `app/symbol/`.
//
//   An indicator importing ANOTHER indicator is both P1 and P3; it is reported once, as P1.
//
// "Indicator folder" is EVERY direct SUBDIRECTORY of `indicators/` except `selection` — a loose
// file at the root (`catalog.test.ts`, `index.ts`) is its own layer, still under P2 (the core may
// not import it) and P3 (it may not import an indicator folder). `selection/` is the selection's
// infrastructure and imports the catalog, so the exception is carried here BY NAME (`SPEC-011 §5.3`). Consequence, on purpose: a folder named
// `indicators/_shared/` is just another indicator folder, so a second indicator importing it is
// P1 — `RN-5` ("there is no `indicators/_shared/`") falls out of the rule instead of needing its own.
//
// ── What this rule DELIBERATELY does not enforce (declared, not forgotten) ───────────────────
//
//   - The "no" cells of the table that are NOT one of P1–P3: `indicators/<a>/** -> chrome/**`, and
//     "who may import `chrome/**`". `SPEC-011 §5.3` fixes three prohibitions; widening the gate is
//     an act of that SPEC, not of this file.
//   - The `charts` barrel column: that is `ADR-034/D8`'s `no-restricted-imports` block, which this
//     rule leaves untouched (and the rule test proves it still bites inside `indicators/<kind>/`).
//   - A specifier computed at runtime (string concatenation, an interpolated template literal):
//     no AST node carries its value before the program runs — the same boundary the `ADR-003`
//     addendum declares for the `no-restricted-syntax` selectors.
//   - Bare/package specifiers (`react`, `lightweight-charts`) and any path alias: `tsconfig.json`
//     declares no `paths` today, so every in-repo reference is relative. A future alias must
//     be resolved HERE, in `resolveReference`, before it is used.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** `frontend/src/app/symbol/`, resolved from this file's own location — never from `cwd`, so the
 * rule classifies the same way whether ESLint runs from `frontend/` or from the repo root. */
const SYMBOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/app/symbol");

/** Source extensions stripped before classifying, so `../catalog` and `../catalog.ts` are the
 * same target. */
const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * Classify an absolute module path into one layer of the table above.
 *
 * Returns one of:
 *   `{ layer: "outside" }`                     — not under `app/symbol/`
 *   `{ layer: "core" }` / `{ layer: "chrome" }` — `chart/**`, `chrome/**`
 *   `{ layer: "contract" }` / `{ layer: "catalog" }` / `{ layer: "selection" }`
 *   `{ layer: "indicators-root" }`             — `indicators/` itself (a directory import)
 *   `{ layer: "indicators-root-file" }`        — any other FILE directly in `indicators/`
 *   `{ layer: "indicator", kind }`              — `indicators/<kind>/**`
 *   `{ layer: "route" }`                        — anything else under `app/symbol/`
 */
function classify(absolutePath) {
  const relative = path.relative(SYMBOL_ROOT, absolutePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { layer: "outside" };
  }
  const segments = relative.split(path.sep);
  const head = segments[0];
  if (head === "chart") {
    return { layer: "core" };
  }
  if (head === "chrome") {
    return { layer: "chrome" };
  }
  if (head !== "indicators") {
    return { layer: "route" };
  }
  if (segments.length === 1) {
    return { layer: "indicators-root" };
  }
  const child = segments[1].replace(SOURCE_EXTENSION, "");
  if (child === "contract" && segments.length === 2) {
    return { layer: "contract" };
  }
  if (child === "catalog" && segments.length === 2) {
    return { layer: "catalog" };
  }
  if (child === "selection") {
    return { layer: "selection" };
  }
  // `SPEC-011 §5.3`: an indicator folder is a SUBDIRECTORY of `indicators/`. A loose FILE at the
  // root (`indicators/catalog.test.ts`, `indicators/index.ts`) is not one — classifying it as an
  // indicator made `catalog.test.ts -> ./catalog.ts` a false P1 (`W-F0-REVIEW` W-1). The path is
  // lexical, so "file" means "two segments ending in a source extension"; an extension-less
  // two-segment target (`./oi`) stays an indicator folder — the conservative reading.
  if (segments.length === 2 && SOURCE_EXTENSION.test(segments[1])) {
    return { layer: "indicators-root-file" };
  }
  // Every other direct child is an indicator folder — including `indicators/contract/…` or
  // `indicators/catalog/…` as a FOLDER, which is not the sanctioned file (conservative: isolated).
  return { layer: "indicator", kind: child };
}

/**
 * The absolute path a relative specifier points at, or `null` when it is not an in-repo relative
 * reference (bare package specifier). Resolution is lexical (`path.resolve`), never a filesystem
 * lookup — the classification depends only on directories, so it works on virtual file names too.
 */
function resolveReference(sourceFile, specifier) {
  if (specifier !== "." && specifier !== ".." && !specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }
  return path.resolve(path.dirname(sourceFile), specifier);
}

/** The static string of a specifier node: a string `Literal`, or a template literal with no
 * interpolation. Anything else is runtime-computed and out of scope (see the header). */
function staticSpecifier(node) {
  if (node === null || node === undefined) {
    return null;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? null;
  }
  if (node.type === "TSLiteralType") {
    return staticSpecifier(node.literal);
  }
  return null;
}

/** Which prohibition (if any) a `source -> target` edge violates: `"P1"`, `"P2"`, `"P3"` or
 * `null`. Order matters only for the double case (indicator -> other indicator), reported as P1. */
function violatedProhibition(source, target) {
  const targetIsUnderIndicators = [
    "contract",
    "catalog",
    "selection",
    "indicators-root",
    "indicators-root-file",
    "indicator",
  ].includes(target.layer);

  if (source.layer === "indicator") {
    const crossesToOtherIndicator = target.layer === "indicator" && target.kind !== source.kind;
    // `indicators-root` (`import ".."`, `W-F0-QA` W3) and `indicators-root-file` are P1 too: an
    // indicator imports only the core, `contract.ts`, its own folder and the charts barrel, and a
    // root barrel (`indicators/index.ts`) re-exporting the catalog would otherwise be the detour.
    const reachesRoot = target.layer === "indicators-root" || target.layer === "indicators-root-file";
    if (crossesToOtherIndicator || reachesRoot || target.layer === "catalog" || target.layer === "selection") {
      return "P1";
    }
  }
  if ((source.layer === "core" || source.layer === "chrome") && targetIsUnderIndicators) {
    return "P2";
  }
  if (target.layer === "indicator") {
    const isOwnFolder = source.layer === "indicator" && source.kind === target.kind;
    if (!isOwnFolder && source.layer !== "catalog") {
      return "P3";
    }
  }
  return null;
}

/** The local ESLint rule registered as `local/indicator-isolation` in `../eslint.config.mjs`. */
export const indicatorIsolationRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "ADR-050/D6 + SPEC-011 §5.3: an indicator under app/symbol/indicators/<kind>/ is an " +
        "isolated module — no indicator imports another, the catalog or the selection (P1); the " +
        "core (chart/**) and the chrome (chrome/**) import nothing under indicators/ (P2); and " +
        "only indicators/catalog.ts imports an indicator folder from outside it (P3).",
    },
    schema: [],
    messages: {
      P1:
        "ADR-050/D6 P1 (SPEC-011 §5.3): indicator `{{sourceKind}}` may not import `{{target}}` — " +
        "an indicator imports only the core (chart/**), contract.ts, its own folder and the " +
        "charts barrel. If two indicators need the same thing it is core (chart/…) or geometry " +
        "(charts/); there is no indicators/_shared/.",
      P2:
        "ADR-050/D6 P2 (SPEC-011 §5.3, G-R): chart/** and chrome/** may not import `{{target}}` — " +
        "the core knows no indicator, contract.ts included; it receives the definitions as an " +
        "argument from SymbolClient.tsx/page.tsx.",
      P3:
        "ADR-050/D6 P3 (SPEC-011 §5.3, CA-6): only indicators/catalog.ts may import an indicator " +
        "folder (`{{target}}`) from outside it — go through the catalog.",
    },
  },
  create(context) {
    const sourceFile = context.filename;
    const source = classify(sourceFile);

    function check(reportNode, specifierNode) {
      const specifier = staticSpecifier(specifierNode);
      if (specifier === null) {
        return;
      }
      const resolved = resolveReference(sourceFile, specifier);
      if (resolved === null) {
        return;
      }
      const target = classify(resolved);
      const prohibition = violatedProhibition(source, target);
      if (prohibition === null) {
        return;
      }
      context.report({
        node: reportNode,
        messageId: prohibition,
        data: {
          target: path.relative(path.dirname(SYMBOL_ROOT), resolved).split(path.sep).join("/"),
          sourceKind: source.kind ?? "",
        },
      });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null && node.source !== undefined) {
          check(node, node.source);
        }
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node, node.arguments[0]);
        }
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === "TSExternalModuleReference") {
          check(node, node.moduleReference.expression);
        }
      },
      TSImportType(node) {
        check(node, node.argument);
      },
    };
  },
};
