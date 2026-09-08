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
import { useClientFingerprintBoundaryRule } from "./eslint-rules/use-client-fingerprint-boundary.mjs";

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

  // ── `ADR-003` FR-1/FR-2, made EXECUTABLE — `D5.12` (born `D1.6` in phase 01, see
  //    `T-05.1`'s task `refs` for the full migration history) ─────────────────────────────
  //
  // `ADR-003` decided the fronteira `charts` <-> `web` by DATA CONTRACT, not by path
  // (`ADR-003:46`, recusing the alternative "fronteira por caminho" for a DIFFERENT
  // question: WHO OWNS a file for `[agents.by_component]`/`code_paths` classification —
  // moving a file there silently reassigns the architect that reviews it). The two rules
  // below answer a NARROWER, EXECUTABLE question instead: may a given SOURCE FILE, as it
  // sits on disk TODAY, import a given TARGET module? `no-restricted-imports` is, per
  // `T-05.1`'s handoff, "o unico instrumento disponivel em TS que casa especificador de
  // MODULO" — for a same-repo relative import that specifier IS the resolved path, so this
  // rule DOES read paths, but it never feeds `harness.toml`/`[agents.by_component]` (this
  // file is not that artifact) and a future reorganization costs ONE edit HERE, not a
  // silent re-attribution of ownership. `05_fatia_visivel.md:53` names this exact question
  // as the one `T-05.1` had to answer "com medicao" (with measurement) before `D5.12`
  // closes — the measurement is `eslint-boundary.test.ts`, which plants a
  // real violator per direction and asserts `eslint` refuses it (MORDE), then removes them
  // and asserts the real modules of both sides stay clean (CALA), in the SAME test run.
  //
  // SYMMETRIC AND TOTAL, on purpose, for THIS task's scope: `T-05.1`'s handoff is explicit
  // that no chart is rendered yet ("Do NOT implement T-05.2+ ... no actual chart
  // rendering") — nothing legitimately needs to cross the boundary today (there is no
  // mounting code, no page composing a chart). When `T-05.2`+ needs `web` to mount a chart
  // component, THAT task is where a narrower exception (e.g. a single sanctioned
  // `charts/index.ts` surface) gets carved and re-measured — not invented here ahead of
  // the code that would use it.
  //
  // `web` = `src/app/**` + `src/features/**`, the exact universe `T-05.1`'s dispatch names
  // for the `cala` side. `src/components/**` is NOT in this universe yet — a known,
  // declared gap (no existing file there imports either side today, verified by
  // `eslint-boundary.test.ts`'s own inventory check), left for whoever next
  // classifies that directory rather than silently folded into `web` by this task.
  {
    files: ["src/charts/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "**/features/**"],
              message:
                "ADR-003 FR-1: `charts` does no I/O and knows no route/session — importing " +
                "`web` (`app/`/`features/`) from `charts` is forbidden in this direction (D5.12).",
            },
          ],
        },
      ],
      // `no-restricted-imports` above only registers on `ImportDeclaration` /
      // `ExportNamedDeclaration` / `ExportAllDeclaration` — verified against the rule's own
      // source, `node_modules/eslint/lib/rules/no-restricted-imports.js:858-864` — and it
      // NEVER fires on `ImportExpression`, the AST node for dynamic `import("...")`. That is a
      // structural gap in the upstream rule, not a config mistake: `await import("../charts/
      // canonical-grid.ts")` from `src/app/` crossed the boundary with `rc=0` (found by
      // independent QA, `docs/context/plataforma-dados/gates/T-05.1-qa.md` §3). Dynamic import
      // is the idiomatic pattern for lazy-loading chart libs (`next/dynamic`), so this is not a
      // theoretical hole — it is the exact shape the next chart-mounting task will reach for.
      // `no-restricted-syntax` fills it with an `esquery` selector on `ImportExpression`,
      // mirroring the same target group as the `no-restricted-imports` rule above.
      //
      // Round-2 QA (`T-05.1-qa.md`, RODADA 2 §2) found that the `[source.value=/.../]`
      // selector above only matches when `source` is a `Literal` node — a plain string. Two
      // MORE selectors are added here, each closable by the same AST reasoning:
      //   - a bare template literal, `import(\`../charts/x.ts\`)` — no interpolation
      //     (`expressions.length === 0`), so the whole string is known before the program
      //     runs and lives at `source.quasis.0.value.cooked` (verified reachable by esquery,
      //     `node -e "esquery.match(...)"`, 1 match, see gate for the exact command).
      //   - `require("../charts/x.ts")` — a `CallExpression` whose `callee.name === "require"`
      //     with a `Literal` first argument is exactly as resolvable as the `ImportExpression`
      //     case above; `no-restricted-imports` never registers a `CallExpression` listener
      //     (`grep -c CallExpression node_modules/eslint/lib/rules/no-restricted-imports.js`
      //     → 0), so this needs its own `no-restricted-syntax` selector, not an extension of
      //     an existing rule.
      // What is DELIBERATELY NOT added here — string concatenation
      // (`import("../charts/" + "x.ts")`) and an INTERPOLATED template literal
      // (`import(\`../charts/${x}\`)`) — is declared out of scope in the `ADR-003` addendum
      // (2026-09-02, "boundary declaration" section), not silently dropped: both require
      // evaluating a runtime-computed value, and neither AST node exposes a string before the
      // program executes (`BinaryExpression` has no `.value`; a `TemplateLiteral` with
      // `expressions.length > 0` has no single `.cooked` that names the target ahead of time).
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/(^|\\/)(app|features)(\\/|$)/]",
          message:
            "ADR-003 FR-1 (dynamic form): `charts` does no I/O and knows no route/session — " +
            "dynamically importing `web` (`app/`/`features/`) from `charts` is forbidden in " +
            "this direction (D5.12), same as the static form.",
        },
        {
          selector:
            "ImportExpression[source.type='TemplateLiteral'][source.expressions.length=0]" +
            "[source.quasis.0.value.cooked=/(^|\\/)(app|features)(\\/|$)/]",
          message:
            "ADR-003 FR-1 (dynamic form, bare template literal): `charts` does no I/O and " +
            "knows no route/session — dynamically importing `web` (`app/`/`features/`) via a " +
            "non-interpolated template literal is forbidden in this direction (D5.12), same " +
            "as the plain-string form.",
        },
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/(^|\\/)(app|features)(\\/|$)/]",
          message:
            "ADR-003 FR-1 (require form): `charts` does no I/O and knows no route/session — " +
            "`require`-ing `web` (`app/`/`features/`) from `charts` is forbidden in this " +
            "direction (D5.12), same as the static/dynamic-import forms.",
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx,mts,cts}", "src/features/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/charts/**"],
              message:
                "ADR-003 FR-2: `web` does not compute geometry — importing `charts` directly " +
                "from `web` is forbidden in this direction (D5.12); no sanctioned crossing " +
                "point exists yet (T-05.2+ is out of scope for T-05.1).",
            },
          ],
        },
      ],
      // Mirror of the `charts` block above — see the comment there for why this rule exists
      // in addition to `no-restricted-imports`: dynamic `import()` is invisible to that rule
      // (`ImportExpression` is not one of its 3 registered node types). Also mirrors the two
      // round-2 additions (bare template literal, `require`) — see that comment for why
      // string concatenation and interpolated template literals are declared out of scope
      // instead, in the `ADR-003` addendum.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/(^|\\/)charts(\\/|$)/]",
          message:
            "ADR-003 FR-2 (dynamic form): `web` does not compute geometry — dynamically " +
            "importing `charts` from `web` is forbidden in this direction (D5.12), same as " +
            "the static form; no sanctioned crossing point exists yet (T-05.2+ is out of " +
            "scope for T-05.1).",
        },
        {
          selector:
            "ImportExpression[source.type='TemplateLiteral'][source.expressions.length=0]" +
            "[source.quasis.0.value.cooked=/(^|\\/)charts(\\/|$)/]",
          message:
            "ADR-003 FR-2 (dynamic form, bare template literal): `web` does not compute " +
            "geometry — dynamically importing `charts` via a non-interpolated template " +
            "literal is forbidden in this direction (D5.12), same as the plain-string form.",
        },
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/(^|\\/)charts(\\/|$)/]",
          message:
            "ADR-003 FR-2 (require form): `web` does not compute geometry — `require`-ing " +
            "`charts` from `web` is forbidden in this direction (D5.12), same as the " +
            "static/dynamic-import forms.",
        },
      ],
    },
  },

  // ── `ADR-034/D8`, made EXECUTABLE — the ONE sanctioned crossing point, `src/app/symbol/**`
  //    only (`T-02.2`) ──────────────────────────────────────────────────────────────────────
  //
  // The `web` block right above forbids `web -> charts` OUTRIGHT (`ADR-003/D5.12`) — correct
  // for every route except the one this block narrows: `T-02.4`'s `src/app/symbol/page.tsx`
  // needs to import the sanctioned barrel, `src/charts/index.ts` (`ADR-034/D8`, plan `02` item
  // `2.1`). Flat config resolves this by ORDER, not by precedence keyword: "the last block
  // that matches file+rule wins" (`ADR-034/D8`, literal) — this block comes AFTER the general
  // `web` block and re-declares BOTH `no-restricted-imports` and `no-restricted-syntax` for
  // the narrower `files` glob below, so for a file under `src/app/symbol/**` these settings
  // REPLACE the general ones entirely rather than adding to them.
  //
  // The exception is as narrow as `ADR-034/D8` writes it: `no-restricted-imports.patterns[].
  // group` keeps the general `"**/charts/**"` prohibition and ADDS three negations for
  // exactly the barrel's own three possible specifiers (extension-less, `.ts`, `.tsx`) — a
  // deep import like `charts/s2-cvd` is UNCHANGED here, still forbidden, because none of the
  // three negations match it. The three `no-restricted-syntax` selectors (dynamic import,
  // bare template literal, `require`) get the SAME narrowing, applied as a single negative
  // lookahead on the regex instead of three positive negations (an `esquery` `source.value`
  // pattern has no `group`-style array to negate against) — `/(^|\/)charts(\/|$)/` (matches
  // `.../charts` OR `.../charts/anything`) becomes `/(^|\/)charts\/(?!index(\.tsx?)?$)/`
  // (still requires a `/` after `charts`, i.e. still never matches the bare `charts` barrel
  // directory import itself — the SAME thing the general rule already refused, and still not
  // sanctioned — but now ALSO excepts `charts/index`, `charts/index.ts`, `charts/index.tsx`
  // specifically via the `(?!...)` negative lookahead, and refuses every other
  // `charts/<anything>` exactly as before).
  //
  // `eslint-boundary.test.ts`'s 3 new cases (`T-02.3`, `ADR-034/D8`'s own falsifier table)
  // prove this narrowing MORDE+CALA, not merely typecheck clean: a deep import planted INSIDE
  // `src/app/symbol/**` still bites (morde-1); the SAME barrel import planted OUTSIDE this
  // glob, in `src/app/console/**`, still bites too (morde-2, scope containment — the general
  // `web` block above is what catches it, unchanged); and the barrel import in the real
  // `src/app/symbol/page.tsx` stays green (cala).
  {
    files: ["src/app/symbol/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/charts/**", "!**/charts/index", "!**/charts/index.ts", "!**/charts/index.tsx"],
              message:
                "ADR-034/D8: `src/app/symbol/**` may import ONLY the sanctioned barrel " +
                "(`charts/index.ts`) — a deep import (e.g. `charts/s2-cvd`) is still forbidden " +
                "even inside this route; go through the barrel instead.",
            },
          ],
        },
      ],
      // Mirrors the general `web` block's 3 `no-restricted-syntax` selectors (dynamic
      // `import()`, bare template literal, `require`) with the SAME narrowing the
      // `no-restricted-imports` patterns above apply — see this block's own header comment
      // for the exact regex change and why a negative lookahead replaces the `group`
      // negations here (an `esquery` string-value selector has no array to negate against).
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/(^|\\/)charts\\/(?!index(\\.tsx?)?$)/]",
          message:
            "ADR-034/D8 (dynamic form): `src/app/symbol/**` may dynamically import ONLY the " +
            "sanctioned barrel (`charts/index.ts`) — a deep dynamic import is still forbidden.",
        },
        {
          selector:
            "ImportExpression[source.type='TemplateLiteral'][source.expressions.length=0]" +
            "[source.quasis.0.value.cooked=/(^|\\/)charts\\/(?!index(\\.tsx?)?$)/]",
          message:
            "ADR-034/D8 (dynamic form, bare template literal): `src/app/symbol/**` may " +
            "dynamically import ONLY the sanctioned barrel (`charts/index.ts`) via a " +
            "non-interpolated template literal — a deep import is still forbidden.",
        },
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/(^|\\/)charts\\/(?!index(\\.tsx?)?$)/]",
          message:
            "ADR-034/D8 (require form): `src/app/symbol/**` may `require` ONLY the sanctioned " +
            "barrel (`charts/index.ts`) — a deep `require` is still forbidden.",
        },
      ],
    },
  },

  // ── `ADR-005/D6.3`+`D6.4`, made EXECUTABLE — `D5.17(b)`, REWRITTEN BY DIRECTIVE (`T-01.2`,
  //    `ADR-028/D3`; born `T-05.16`, superseded here) ────────────────────────────────────────
  //
  // `D6.4` fixed `fingerprint()` (`s1-console/ingest-health-query.ts`) as the ONE synchronous
  // canonicalization path — the alternative, `crypto.subtle.digest`, is `Promise`-returning
  // BY SPEC in every runtime (Node or browser). A SECOND production call site importing
  // `fingerprint`/`canonicalProjection`/`canonicalLines` BY VALUE, from a Client Component,
  // would force that decision to be re-made on a `Promise`-returning instrument. A TYPE-only
  // import (`IngestHealthGapRow`, `IngestHealthProjection`, …) carries no such risk: no
  // function body crosses with it, so it stays allowed everywhere, directive or not.
  //
  // `T-05.16`'s original rule (`@typescript-eslint/no-restricted-imports`, `group:
  // ["**/ingest-health-query.ts"]`) blocked the VALUE import from EVERY non-test file under
  // `src/`, by PATH, regardless of runtime — it could not tell a Server Component (safe: Node
  // only, no browser bundle) from a Client Component (unsafe) apart, because path never
  // encodes that. `T-01.4`'s `page.tsx` (a Server Component, `async`, no `"use client"`) needs
  // exactly the VALUE import the old rule forbade, so the old rule would have had to be
  // special-cased per file — the SAME defect `ADR-003:46` warns against for a path-keyed
  // boundary, just on a different pair of directions.
  //
  // `ADR-028/D3` re-keys the property on the DIRECTIVE instead: `local/use-client-fingerprint-
  // boundary` (`./eslint-rules/use-client-fingerprint-boundary.mjs`) walks the Program's first
  // statement for the `"use client"` prologue and only THEN inspects `ImportDeclaration`s
  // against `ingest-health-query.ts` — a file without the directive is invisible to this rule,
  // by design (`quant-architect`'s co-signature, point 4: `next build`'s `server-only`
  // enforcement is the actual JUDGE of the transitive case; this rule is the cheap per-file
  // SIGNAL for the direct case only). See that file's header comment for the full reasoning,
  // including why form (i) — a directive check — was chosen over form (ii) (a `*.client.tsx`
  // naming convention), both declared equivalent by `ADR-028/D3`.
  //
  // `*.test.ts` stays excluded, mirroring `D5.17(b)`'s own `grep -v '\.test\.'`:
  // `ingest-health-query.test.ts`/`ingest-health-query-http.test.ts` ARE consumer #1 (the
  // module exercising its own exports), not a second production call site — and
  // `fingerprint-sync-boundary.test.ts` (same directory) plants its OWN ephemeral `"use
  // client"` probes to prove this rule morde+cala, which would collide with a self-applying
  // exclusion-less version of this block.
  {
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    plugins: {
      local: {
        rules: {
          "use-client-fingerprint-boundary": useClientFingerprintBoundaryRule,
        },
      },
    },
    rules: {
      "local/use-client-fingerprint-boundary": "error",
    },
  },
);
