// Project ESLint — flat config.
//
// This file is the instrument that `ADR-011/D4` adopted IN PLACE OF two `[[rules.own]]`
// regexes (`ts-explicit-any`, `ts-browser-console`). The reason is measured and is not a
// matter of taste: over a universe of 3 files / 4 lines, neither regex variant is
// simultaneously complete and correct — the narrow one (`:\s*any\b`) misses
// `Record<string, any>` and `Map<string, any>`, the wide one (`\bany\b`) reports an
// object key, and JSX TEXT defeats both. An AST distinguishes `TSAnyKeyword` from an
// `Identifier` and from a `JSXText`: they are different nodes, not text coincidences.
//
// The two rules below are the exact equivalents of the two rules that were dropped, and
// they are pinned here EXPLICITLY rather than inherited from a preset, so that a preset
// upgrade cannot silently downgrade them to `warn`.
//
// NOTE: this linter is INSTALLED, not yet a gate. `test_cmd` is read by no gate, and the
// `pre-push` hook does not run `make`. Wiring it to something that refuses is
// `ADR-011/D2` (`Makefile`, `T-01.6`) plus `D3b` (`scripts/hooks/pre-push.pre-harness`,
// `T-01.5`). Until then, saying it is enforcement would be a claim this repository has
// no evidence for.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", ".next/**", "out/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The extension must NOT decide whether a file is linted. With
    // `["**/*.ts", "**/*.tsx"]` a `.jsx` component was reported by nothing at all, and
    // a `.js` fell through to the flat-config default expansion without the two pinned
    // rules -- measured 2026-08-28 over a bench of two sibling probes carrying the same
    // `console.log`: `eslint -f json src` listed 6 files, `serie.jsx` ABSENT, `serie.js`
    // present with `no-undef` only. Next.js emits `.js` and `.jsx`, so that hole is on
    // the path of the `charts`/`web` tasks. The list below is the same source-extension
    // family that `code_paths.include_globs` now carries, and the two lists are meant to
    // stay in step: a file the rule gate calls code is a file this linter reads.
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    rules: {
      // Successor of the dropped `own.ts-explicit-any`.
      "@typescript-eslint/no-explicit-any": "error",
      // Successor of the dropped `own.ts-browser-console`.
      "no-console": "error",
    },
  },
);
