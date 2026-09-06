// `ADR-028/D3` (`T-01.2`) — the ESLint half of `D5.17(b)`, REWRITTEN by DIRECTIVE instead of by
// file path. The property this rule measures (`ADR-028/D3:35`, verbatim): "import de VALOR de
// `ingest-health-query.ts` em arquivo cuja primeira instrução é a diretiva `"use client"` ⇒
// reprova; o mesmo import em arquivo sem a diretiva ⇒ passa; `import type` passa em qualquer
// lugar."
//
// WHY BY DIRECTIVE AND NOT BY PATH (the property `T-01.1` made obsolete-as-a-path-rule): the
// predecessor of this rule (`@typescript-eslint/no-restricted-imports`, `group:
// ["**/ingest-health-query.ts"]`) fired on EVERY non-test file under `src/`, including a Server
// Component that legitimately needs the module's VALUE exports (`fetchIngestHealthProjectionViaHttp`,
// `T-01.4`'s `page.tsx`) — the rule could not tell "`page.tsx`, server, safe" from "a Client
// Component, unsafe" because path never encodes runtime. `quant-architect`'s co-signature
// (`ADR-028` §"Co-assinatura", point 4) names `next build`'s `server-only` enforcement as the
// actual JUDGE of the property (it walks the real module graph, including transitive imports
// through a directive-less `.ts`); THIS rule is the cheap, fast, per-file SIGNAL that
// `make lint-frontend` can run without a full build — it catches the direct case immediately and
// deliberately does not catch the transitive one (`F-028-1''`), which is `next build`'s job.
//
// WHY A DIRECTIVE-PROLOGUE CHECK INSTEAD OF A FILE-NAME CONVENTION (`ADR-028/D3`'s form (ii),
// `*.client.tsx` + glob): form (i) was chosen here because the directive IS the ground truth Next
// itself reads to decide which bundle a module lands in — a naming convention could drift from
// the actual directive (a `.client.tsx` file that forgot `"use client"`, or vice versa) without
// either instrument noticing. Reading the directive costs nothing extra: `Program.body[0]` is
// already visited by ESLint on every file, and `@typescript-eslint/typescript-estree` already
// tags a leading string-literal `ExpressionStatement` with `.directive` (own source,
// `typescript-estree/dist/convert.js`, `convertBodyExpressions`), the SAME mechanism ESLint core
// itself uses to detect `"use strict"`.
//
// The two forms are declared EQUIVALENT by `ADR-028/D3` ("A propriedade é a mesma nas duas; o
// falsificador `F-028-3` abaixo vale para as duas") — this file documents why form (i) was picked,
// not that form (ii) was wrong.

/** Matches `ingest-health-query.ts` regardless of how many `../` segments precede it — mirrors
 * the glob the predecessor rule used (`**\/ingest-health-query.ts`), just expressed as a plain
 * regex against `ImportDeclaration.source.value` (a specifier string), since this rule inspects
 * the AST directly instead of delegating to `no-restricted-imports`' own matcher. */
const TARGET_MODULE_PATTERN = /(^|\/)ingest-health-query\.ts$/;

/**
 * `true` only when the file's very first statement is the `"use client"` directive — a directive
 * prologue is positional (it has to be the first statement, or the first run of string-literal
 * statements), so checking `body[0]` alone is exactly what the directive-prologue rules (`"use
 * strict"`, Next's own `"use client"`) require: a `"use client"` string appearing AFTER any other
 * statement is not a directive at all, just an inert expression statement, and Next does not
 * treat it as one either.
 */
function fileHasUseClientDirective(programNode) {
  const first = programNode.body[0];
  return (
    first !== undefined && first.type === "ExpressionStatement" && first.directive === "use client"
  );
}

/**
 * `true` when this import statement pulls at least one VALUE (non-type) binding across —
 * `import type { X } from "..."` (whole-declaration `importKind: "type"`) and
 * `import { type X } from "..."` (per-specifier `importKind: "type"`) both return `false`. A bare
 * side-effect import (`import "./ingest-health-query.ts"`, no specifiers) is treated as a VALUE
 * import: it has no legitimate reading as "type only" — a side-effect import runs the module's
 * top-level code, exactly the crossing `ADR-005/D6.4` forbids from a Client Component.
 */
function importPullsAValue(importDeclarationNode) {
  if (importDeclarationNode.importKind === "type") {
    return false;
  }
  if (importDeclarationNode.specifiers.length === 0) {
    return true;
  }
  return importDeclarationNode.specifiers.some(
    (specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
  );
}

/** The local ESLint rule registered as `local/use-client-fingerprint-boundary` in
 * `../eslint.config.mjs`. */
export const useClientFingerprintBoundaryRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "ADR-028/D3 (D5.17b): a `\"use client\"` module may not VALUE-import " +
        "ingest-health-query.ts — only `import type` may cross into a Client Component; a " +
        "module without the directive is unaffected by this rule (next build's server-only " +
        "enforcement is the judge for that case, ADR-028 co-signature point 4).",
    },
    schema: [],
    messages: {
      forbidden:
        "ADR-005/D6.4 (D5.17b, ADR-028/D3): this `\"use client\"` module VALUE-imports " +
        "`ingest-health-query.ts` — that drags `fingerprint()`'s dependency chain " +
        "(`canonicalProjection`/`canonicalLines`/`sha256Hex`) into a Client Component, which " +
        "`ADR-005/D6.4` forbids. Use `import type` for the row shapes, or move the call " +
        "server-side.",
    },
  },
  create(context) {
    let currentFileHasDirective = false;
    return {
      Program(node) {
        currentFileHasDirective = fileHasUseClientDirective(node);
      },
      ImportDeclaration(node) {
        if (!currentFileHasDirective) {
          return;
        }
        if (typeof node.source.value !== "string" || !TARGET_MODULE_PATTERN.test(node.source.value)) {
          return;
        }
        if (importPullsAValue(node)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};
