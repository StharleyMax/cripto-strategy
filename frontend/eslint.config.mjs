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
// NOTE, superseded 2026-08-28 by `T-01.5` -- kept because it names the two pieces that
// had to arrive: this linter used to be INSTALLED and not a gate, because `test_cmd` is
// read by no gate and the `pre-push` hook did not run `make`. Both pieces landed:
// `ADR-011/D2` (`Makefile`, `T-01.6`) and `D3b` (`scripts/hooks/pre-push.pre-harness`,
// `T-01.5`).
//
// READ THE CONDITION -- it is the whole sentence, and it was missing here until 2026-08-29
// (`/review`). WITH THE HOOK INSTALLED (`bash scripts/install-git-hooks.sh`), `make lint`
// runs from `pre-push`, and the evidence the old note asked for exists: a `.tsx` carrying
// `any` + `console` makes `git push --dry-run` REFUSED (rc=1), and removing it makes the
// push ACCEPTED (rc=0) [MEASURED 2026-08-28, isolated bench clone; see frontend/README.md
// section 4, whose table carries "hook installed" as a COLUMN because it is the variable].
//
// WITHOUT the hook installed, the push is ACCEPTED with the violator in the tree -- and
// that is the state of the owner's disk today: `ls .git/hooks` -> only `commit-msg` and
// `pre-push` [MEASURED 2026-08-29]. Versioned is not installed, and `harness doctor` says
// CONFORME without mentioning the absence. See the HAND-OFF section of backend/README.md.
//
// `test_cmd.web` is still NOT declared -- that is a separate decision, and it belongs to
// whoever owns the `web` component.
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
