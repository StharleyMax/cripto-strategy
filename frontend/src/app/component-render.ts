/**
 * `estrutura-do-front` `T-10.11` — THE component render harness of `node --test`, no new dependency.
 * The pattern is the `frontend-architect`'s (`docs/context/estrutura-do-front/gates/T-10.11-padrao.md`,
 * code transcribed from its §3.1); this file is its implementation, not a second decision.
 *
 * Installs, IN-PROCESS, a synchronous module hook (`module.registerHooks`) that:
 *  (1) loads `.tsx` by `ts.transpileModule` (jsx: react-jsx), and
 *  (2) maps every `react`/`react-dom` `*.react-server.js` entry (picked because `test:app` runs
 *      under `--conditions=react-server`) to its CLIENT build: under `react-server`,
 *      `react-dom/client` throws on import and `react` has no `useState`.
 * Because ESM links the whole static graph before evaluating, `.tsx` and `react-dom/client` can only
 * be reached by DYNAMIC import after this module has run.
 *
 * The contract a test file signs (`T-10.11-padrao.md` §7): this module is its FIRST import; React,
 * react-dom, every `.tsx` and every `.ts` that imports `react` come in by `await import()`; JSX does
 * not exist in a test, `createElement` (re-exported here) does. It lives under `frontend/src/` on
 * purpose: outside it, the file escapes the project ESLint and `harness code-paths`.
 */
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import type { ReactNode } from "react";

const require = createRequire(import.meta.url);
// Stack traces of a transpiled `.tsx` point at SOURCE lines, through the inline map emitted below.
process.setSourceMapsEnabled(true);
const ts = require("typescript") as typeof import("typescript");

const SERVER_ENTRY = /\/node_modules\/(react|react-dom)\/([\w-]+)\.react-server\.js$/;

function clientEntryOf(url: string): string {
  const match = SERVER_ENTRY.exec(url);
  if (match === null) {
    return url;
  }
  const [, pkg, entry] = match;
  const client = entry === pkg ? "index" : entry;
  return url.replace(SERVER_ENTRY, `/node_modules/${pkg}/${client}.js`);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `next/navigation` & co. ship no `exports` map: the bundler finds `navigation.js`, Node's ESM
    // resolver does not. Same file the bundler picks, so the test sees the module production sees.
    const request = /^next\/[\w-]+$/.test(specifier) ? `${specifier}.js` : specifier;
    const resolved = nextResolve(request, context);
    // A CJS `require("react")` inside react-dom is resolved by the CJS resolver (which still carries
    // `--conditions=react-server`) BEFORE this hook sees it, as an absolute path. Map the server entry
    // back to the client one, so the process holds exactly ONE React (the client build).
    return { ...resolved, url: clientEntryOf(resolved.url) };
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) {
      return nextLoad(url, context);
    }
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
      fileName,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        isolatedModules: true,
        sourceMap: false,
        inlineSourceMap: true,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  },
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent"]) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? dom.window : (dom.window as unknown as Record<string, unknown>)[key],
    configurable: true,
    writable: true,
  });
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");
const { act, createElement } = await import("react");

export { act, createElement };

export type Rendered = { readonly container: HTMLElement; readonly unmount: () => void };

/** Fail LOUD if a static import reached the `react-server` React before the hooks above existed:
 * two Reacts in one process render elements fine and break hooks/context in ways that do not name
 * the cause. */
function assertSingleClientReact(): void {
  const serverCopies = Object.keys(require.cache).filter((file) => /[\\/](react|react-dom)[\\/].*react-server/.test(file));
  if (serverCopies.length > 0) {
    throw new Error(
      `react-server build loaded by a STATIC import (${serverCopies.join(", ")}); import React, react-dom and every module that imports them DYNAMICALLY, after component-render.ts`,
    );
  }
}

export async function render(node: ReactNode): Promise<Rendered> {
  assertSingleClientReact();
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
