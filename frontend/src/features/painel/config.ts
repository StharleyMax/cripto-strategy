/**
 * Bench file 2 of 3 for `D1.3b` — LEGITIMATE use, must stay silent.
 *
 * `any` here is an OBJECT KEY, not a type. The wide regex `\bany\b` reported this line
 * as a violation (false positive, measured 2026-08-28 in ADR-011/D4); an AST-based
 * linter sees an `Identifier` in a property position and says nothing.
 */
export const configPainel = { retry: 3, any: true };
