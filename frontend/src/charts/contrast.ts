/**
 * WCAG 2.x relative luminance and contrast ratio — pure arithmetic over hex strings, no DOM.
 *
 * WHY THIS LIVES IN `charts` AND NOT IN `web`: it is geometry-adjacent math over the palette
 * `color-tokens.ts` owns, and `ADR-003` FR-1 keeps `charts` free of I/O. Reading the computed
 * style of a live element would be the `web` way to get the same number — and `D13` of
 * `docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md` REFUSED that route
 * (alternative `C`, "derivar das CSS custom properties em runtime") precisely because it would
 * make `charts` depend on the DOM.
 *
 * THE FORMULA, quoted from WCAG 2.2 "relative luminance" and "contrast ratio":
 *   - per channel: `c = c8 / 255`, then `c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`
 *   - `L = 0.2126 * R + 0.7152 * G + 0.0722 * B`
 *   - `ratio = (Lbrighter + 0.05) / (Ldarker + 0.05)`, so the result is always `>= 1`.
 *
 * The `0.03928` threshold is the one WCAG 2.x publishes. The later erratum value `0.04045`
 * changes no 8-bit channel's branch (both sit between the 8-bit steps `10/255 = 0.0392` and
 * `11/255 = 0.0431`), so every ratio this module produces is identical under either constant —
 * stated here so a future reader does not "fix" it and expect a different number.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Relative luminance of a `#rrggbb` string, per WCAG 2.x. Throws on any other shape. */
export function relativeLuminance(hex: string): number {
  if (!HEX_RE.test(hex)) {
    throw new Error(`expected a "#rrggbb" color, got ${JSON.stringify(hex)}`);
  }
  const channels = [1, 3, 5].map((offset) => {
    const raw = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. Symmetric, always `>= 1`. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const brighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (brighter + 0.05) / (darker + 0.05);
}
