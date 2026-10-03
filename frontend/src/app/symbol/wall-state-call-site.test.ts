/**
 * `estrutura-do-front` `W-1` of the wave-2 QA (`gates/W-P2-QA.md`) — WHICH SERIES' VERDICT EACH PANE
 * IS FED, read off `SymbolClient`'s call site by AST.
 *
 * The defect this guards (`LS-WRONGFEED`): `<LongShortPane … wallState={oiWallState} />`. Every pane
 * render stays green — the pane draws whatever verdict it is handed — and the long/short pane names
 * OI's wall instead of its own. `tsc --strict` does not refuse it either: both verdicts are a
 * `SlotCoverageState`. The wave QA measured it green on 726/0 after `T-10.11`.
 *
 * Why AST and not a render of `SymbolClient` (option P3 of `gates/T-10.11-padrao.md` §5): that render
 * needs the App Router context (`useRouter`/`usePathname`), a `lightweight-charts` chart host on a
 * JSDOM without canvas, and a `useHistoryPager` seed whose `panelCoverage` puts ONE series past its
 * floor and not the other — three fakes, none probed, to reach one prop. The AST reads that prop
 * directly, and unlike the retired regexes it does not care about prop ORDER, LINE BREAKS or the
 * NAME of the local the verdict is held in (R01–R03 of `gates/T-10.11-build.md` §3): it follows the
 * identifier to its declaration and reads the `panelCoverage.<series>` the verdict is computed from.
 *
 * What the pane DOES with the verdict is `wall-badge-pane-render.test.ts`, by render.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = path.join(HERE, "SymbolClient.tsx");
const clientSource = readFileSync(CLIENT_PATH, "utf8");

/** Each pane that carries the wall badge, and the `pager.panelCoverage` member that is ITS series. */
const EXPECTED_FEED = { OiPane: "oi", LongShortPane: "longShort" } as const;
type WalledPane = keyof typeof EXPECTED_FEED;

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("SymbolClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function collect<T extends ts.Node>(root: ts.Node, pick: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node): void => {
    if (pick(node)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** The `export function SymbolClient` declaration — the one place the panes are mounted. */
function symbolClientOf(file: ts.SourceFile): ts.FunctionDeclaration {
  const matches = file.statements.filter(
    (statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "SymbolClient",
  );
  assert.equal(matches.length, 1, "exactly one `function SymbolClient` in SymbolClient.tsx");
  return matches[0];
}

/** The `wallState={…}` expression of the ONE `<pane …/>` mounted inside `SymbolClient`. */
function wallStateExpressionOf(client: ts.FunctionDeclaration, pane: WalledPane): ts.Expression {
  const elements = collect(client, (node): node is ts.JsxSelfClosingElement | ts.JsxOpeningElement =>
    (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === pane,
  );
  assert.equal(elements.length, 1, `SymbolClient must mount <${pane}> exactly once`);
  const attributes = elements[0].attributes.properties.filter(
    (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText() === "wallState",
  );
  assert.equal(attributes.length, 1, `<${pane}> must receive exactly one wallState prop`);
  const initializer = attributes[0].initializer;
  assert.ok(
    initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined,
    `<${pane} wallState={…}> must be an expression`,
  );
  return initializer.expression;
}

/** Follows an identifier to its `const` declaration inside `SymbolClient`, once; anything else is
 * read as written. A verdict held in a local and one written inline answer the same. */
function resolveLocal(client: ts.FunctionDeclaration, expression: ts.Expression): ts.Expression {
  if (!ts.isIdentifier(expression)) {
    return expression;
  }
  const declarations = collect(
    client,
    (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expression.text,
  );
  assert.equal(declarations.length, 1, `\`${expression.text}\` must be declared once, as a local of SymbolClient`);
  const init = declarations[0].initializer;
  assert.ok(init !== undefined, `\`${expression.text}\` has no initializer to read the feed from`);
  return init;
}

/** THE PREDICATE UNDER TEST: the `panelCoverage` member the pane's verdict is computed from — i.e.
 * `"longShort"` for `panelWallState(pager.window, pager.panelCoverage.longShort)`. */
function wallFeedOf(source: string, pane: WalledPane): string {
  const client = symbolClientOf(parse(source));
  const verdict = resolveLocal(client, wallStateExpressionOf(client, pane));
  assert.ok(
    ts.isCallExpression(verdict) && verdict.expression.getText() === "panelWallState" && verdict.arguments.length === 2,
    `<${pane}>'s verdict must be one panelWallState(window, coverage) call, got \`${verdict.getText()}\``,
  );
  const [window, coverage] = verdict.arguments;
  assert.equal(window.getText(), "pager.window", "the verdict is measured against the pager's own fetched window");
  assert.ok(
    ts.isPropertyAccessExpression(coverage) && coverage.expression.getText() === "pager.panelCoverage",
    `the coverage must be a member of pager.panelCoverage, got \`${coverage.getText()}\``,
  );
  return coverage.name.text;
}

for (const [pane, feed] of Object.entries(EXPECTED_FEED) as [WalledPane, string][]) {
  test(`T-05.6 wiring: <${pane}> is fed the wall verdict of ITS OWN series (panelCoverage.${feed})`, () => {
    assert.equal(wallFeedOf(clientSource, pane), feed);
  });
}

test("the verdict comes from slot-coverage.ts — the one rule, not a local re-implementation", () => {
  const file = parse(clientSource);
  const imports = file.statements.filter(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "./slot-coverage.ts",
  );
  const named = imports.flatMap((declaration) => {
    const bindings = declaration.importClause?.namedBindings;
    return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.map((element) => element.name.text) : [];
  });
  assert.ok(named.includes("panelWallState"), "panelWallState must be imported from ./slot-coverage.ts");
  const localDeclarations = collect(
    file,
    (node): node is ts.FunctionDeclaration | ts.VariableDeclaration =>
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name !== undefined && node.name.getText() === "panelWallState",
  );
  assert.deepEqual(localDeclarations, [], "a local panelWallState would shadow the shared rule");
});

test("negative control by SOURCE mutation: the predicate READS the swap it guards against (LS-WRONGFEED)", () => {
  // The mutant is built by AST spans, not by regex: <LongShortPane>'s wallState expression is
  // replaced by <OiPane>'s, wherever either sits and whatever either is called.
  const client = symbolClientOf(parse(clientSource));
  const longShortExpression = wallStateExpressionOf(client, "LongShortPane");
  const oiExpressionText = wallStateExpressionOf(client, "OiPane").getText();
  const mutant =
    clientSource.slice(0, longShortExpression.getStart()) + oiExpressionText + clientSource.slice(longShortExpression.getEnd());
  // Equal to the MUTATED value, not merely different: a predicate that threw or answered `undefined`
  // would also be "different".
  assert.equal(wallFeedOf(mutant, "LongShortPane"), "oi");
  assert.equal(wallFeedOf(mutant, "OiPane"), "oi");
});
