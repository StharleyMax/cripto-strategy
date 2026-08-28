/**
 * Bench file 3 of 3 for `D1.3b` — LEGITIMATE use, must stay silent.
 *
 * `any` here is JSX TEXT. Both regex variants reported this line (`:\s*any\b` and
 * `\bany\b`), which is what proves no line regex can be simultaneously complete and
 * correct over this universe: there is no position on the axis where this file does not
 * fail. An AST-based linter sees a `JSXText` node and says nothing.
 */
export function Filtro() {
  return <p>Filtro: any resultado serve</p>;
}
