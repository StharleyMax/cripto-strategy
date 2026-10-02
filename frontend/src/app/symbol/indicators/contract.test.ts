// `estrutura-do-front` `T-00.1` (`SPEC-011 §4.1`, emenda `E-4` of `ADR-050`, `RF-1`) — the contract
// does NOT enumerate `kind`, and the files born in `F0` carry types only.
//
// `node --test` strips types and checks none, so a `satisfies` written in THIS file would prove
// nothing at test time. Instead, the test runs the TypeScript compiler (the project's own
// `tsconfig.json`) over IN-MEMORY probes placed at a virtual path next to `contract.ts`, so their
// relative imports resolve to the REAL contract on disk:
//
//   CALA  — a synthetic `IndicatorDefinition<"x">` (a pane, series-history) and one under a kind
//           GENERATED at test time (an overlay, indicator-endpoint) compile with 0 diagnostics,
//           and neither touches `contract.ts`. A kind nobody could have listed in advance is what
//           makes "the contract does not enumerate `kind`" true by construction, not by luck.
//   MORDE — a definition whose `kind` disagrees with its `K` must NOT compile. Without this, a
//           harness that silently reports 0 diagnostics for everything would pass the CALA arm.
//
// Ablation (recorded in the gate report): turn `kind: K` into a literal union in `contract.ts`
// (`"volume" | "oi" | …`) ⇒ the probe `"x"` stops compiling ⇒ this test fails.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(THIS_DIR, "../../../..");
const TSCONFIG_PATH = path.join(FRONTEND_ROOT, "tsconfig.json");

/** The files `T-00.1` creates, all of which must be types only. */
const TYPES_ONLY_FILES = [
  path.join(THIS_DIR, "contract.ts"),
  path.join(THIS_DIR, "..", "chart", "host", "indicator-binding.ts"),
  path.join(THIS_DIR, "..", "chart", "history", "series-requirement.ts"),
];

function compilerOptions(): ts.CompilerOptions {
  const read = ts.readConfigFile(TSCONFIG_PATH, (file) => ts.sys.readFile(file));
  assert.equal(read.error, undefined, "tsconfig.json must parse");
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, FRONTEND_ROOT);
  return { ...parsed.options, noEmit: true, incremental: false };
}

/** Type-checks `source` as a module at `virtualPath`, and returns the probe's own diagnostics. */
function diagnosticsOf(virtualPath: string, source: string): readonly string[] {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  host.fileExists = (file) => file === virtualPath || defaultFileExists(file);
  host.readFile = (file) => (file === virtualPath ? source : defaultReadFile(file));
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) =>
    file === virtualPath
      ? ts.createSourceFile(file, source, languageVersion, true)
      : defaultGetSourceFile(file, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([virtualPath], options, host);
  const probe = program.getSourceFile(virtualPath);
  assert.ok(probe, "the virtual probe must be part of the program");
  return ts
    .getPreEmitDiagnostics(program, probe)
    .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}

const PROBE_PATH = path.join(THIS_DIR, "probe-contract-x", "definition.ts");

function paneProbe(kind: string, declaredKind: string): string {
  return `
import type { EmptyParams, IndicatorDefinition, ParamsParseResult } from "../contract.ts";

function parseParams(raw: unknown): ParamsParseResult<EmptyParams> {
  return raw !== null && typeof raw === "object" && Object.keys(raw).length === 0
    ? { ok: true, params: {} }
    : { ok: false, error: { reason: "only {} is accepted" } };
}

export const definition = {
  kind: ${JSON.stringify(kind)},
  category: "indicator",
  cardinality: "single",
  defaultParams: {},
  parseParams,
  placement: { kind: "pane", paneId: ${JSON.stringify(kind)}, stretch: 1 },
  data: {
    from: "series-history",
    series: [{ slot: "value", matches: (_key, symbol) => symbol.length > 0 }],
    derive: (rows, ctx) => (rows["value"] ?? []).length + ctx.intervalMs,
  },
  View: () => null,
} satisfies IndicatorDefinition<${JSON.stringify(declaredKind)}, EmptyParams, number>;
`;
}

function overlayEndpointProbe(kind: string): string {
  return `
import type { IndicatorDefinition, Placement } from "../contract.ts";
import type { HostPlacement } from "../../chart/host/indicator-binding.ts";

interface Params { readonly period: number }

export const definition: IndicatorDefinition<${JSON.stringify(kind)}, Params, readonly number[]> = {
  kind: ${JSON.stringify(kind)},
  category: "strategy",
  cardinality: "multi",
  defaultParams: { period: 20 },
  parseParams: (raw) =>
    typeof raw === "object" && raw !== null && typeof (raw as { period?: unknown }).period === "number"
      ? { ok: true, params: { period: (raw as { period: number }).period } }
      : { ok: false, error: { reason: "period must be a number" } },
  placement: { kind: "overlay", on: "price", band: { bottomFraction: 0.22 } },
  data: { from: "indicator-endpoint", useData: () => ({ status: "loading" }) },
  View: ({ data }) => (data.status === "ready" ? null : null),
};

// Every contract Placement is a HostPlacement: the host reads only that part.
export const hostView: HostPlacement = definition.placement satisfies Placement;
`;
}

test("CALA: a synthetic IndicatorDefinition<'x'> compiles against the contract on disk", () => {
  assert.deepEqual(diagnosticsOf(PROBE_PATH, paneProbe("x", "x")), []);
});

test("CALA: a kind generated at test time compiles too (overlay + indicator-endpoint arm)", () => {
  const generatedKind = `probe_${randomBytes(6).toString("hex")}`;
  assert.deepEqual(diagnosticsOf(PROBE_PATH, overlayEndpointProbe(generatedKind)), []);
});

test("MORDE: a kind that disagrees with its K does not compile (the harness sees type errors)", () => {
  const diagnostics = diagnosticsOf(PROBE_PATH, paneProbe("y", "x"));
  assert.ok(diagnostics.length > 0, "a kind/K mismatch must be a type error");
  assert.ok(
    diagnostics.some((d) => d.startsWith("TS2322") || d.startsWith("TS1360")),
    `expected an assignability error, got: ${diagnostics.join(" | ")}`,
  );
});

test("the files born in F0 carry types only (no runtime value)", () => {
  for (const file of TYPES_ONLY_FILES) {
    const text = ts.sys.readFile(file);
    assert.ok(text !== undefined, `${file} must exist`);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    for (const statement of source.statements) {
      const typesOnly =
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true) ||
        (ts.isExportDeclaration(statement) && statement.isTypeOnly);
      assert.ok(
        typesOnly,
        `${path.relative(FRONTEND_ROOT, file)}: statement with runtime value: ${statement.getText(source).slice(0, 80)}`,
      );
    }
  }
});
