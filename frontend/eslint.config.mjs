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

  // ── `ADR-005/D6.3`+`D6.4`, made EXECUTABLE — `D5.17(b)` (`T-05.16`) ───────────────────────
  //
  // `D6.4` fixed `fingerprint()` (`s1-console/ingest-health-query.ts`) as the ONE synchronous
  // canonicalization path — the alternative, `crypto.subtle.digest`, is `Promise`-returning
  // BY SPEC in every runtime (Node or browser), so a SECOND production call site importing
  // `fingerprint`/`canonicalProjection`/`canonicalLines` BY VALUE would force that same
  // decision to be re-made somewhere else, on a `Promise`-returning instrument this time —
  // not a hypothetical, it is the exact shape `05_fatia_visivel.md:91` names as "muda de
  // forma". A TYPE-only import (`IngestHealthGapRow`, `IngestHealthProjection`, …) carries no
  // such risk: no function body crosses with it, so it stays allowed.
  //
  // The instrument question this answers is `05_fatia_visivel.md:53`'s ("pode o contrato ser
  // expresso sem que os dois lados sejam definidos por CAMINHO?"), and `T-05.16` HERITS the
  // answer `T-05.1` already measured for `D5.12` rather than re-deciding it: the three named
  // alternatives (`import/no-restricted-paths`, `project references`, a per-module manifest
  // field) all needed infra that does not exist today, and `no-restricted-imports`'s `group`
  // glob DOES read a path, but it never feeds `harness.toml`/`[agents.by_component]` — this
  // file is not that artifact, so `ADR-003:46`'s objection (moving a file silently
  // reassigning its architect) does not reach it.
  //
  // `@typescript-eslint/no-restricted-imports`, not the plain ESLint core rule used by the
  // two blocks above, because ONLY the TypeScript-aware variant has an `allowTypeImports`
  // option (verified against the rule's own source,
  // `node_modules/@typescript-eslint/eslint-plugin/dist/rules/no-restricted-imports.js:23-26,
  // 169-212`) — the base rule has no concept of `import type` at all, and would have to
  // reject every match, type or not, which is a NARROWER boundary than `D5.17(b)`'s DoD asks
  // for (that DoD's own `grep` explicitly crosses `import type` out before judging).
  //
  // `**/ingest-health-query.ts` matches the specifier regardless of how many `../` segments
  // sit in front of it — verified against the plugin's OWN matcher (`ignore`, with
  // `allowRelativePaths: true`, `no-restricted-imports.js:182-186`), which is the exact
  // option that makes a leading `./`/`../` a valid input instead of throwing
  // (`node_modules/ignore/index.js:397`, reproduced by hand against `./ingest-health-query.ts`
  // and `../s1-console/ingest-health-query.ts`, both `-> true` once the option is set).
  //
  // `*.test.ts` is excluded from this block on purpose, mirroring `D5.17(b)`'s own `grep -v
  // '\.test\.'`: `ingest-health-query.test.ts`/`ingest-health-query-http.test.ts` ARE consumer
  // #1 (the module exercising its own exports), not a second production call site — the
  // property this rule polices.
  {
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ingest-health-query.ts"],
              allowTypeImports: true,
              message:
                "ADR-005/D6.3+D6.4 (D5.17b): only `import type` from `ingest-health-query.ts` " +
                "is allowed outside the module itself — a VALUE import drags `fingerprint()`'s " +
                "dependency chain (`canonicalProjection`/`canonicalLines`/`sha256Hex`) into a " +
                "second call site, and `ADR-005/D6.4` requires `fingerprint()` to stay the ONE " +
                "synchronous canonicalization path (never `crypto.subtle.digest`, which is " +
                "`Promise`-returning by spec in every runtime).",
            },
          ],
        },
      ],
    },
  },
);
