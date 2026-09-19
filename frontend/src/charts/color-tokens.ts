/**
 * Color as a NAMED TOKEN PER ROLE, and `critical` structurally OUT of the color channel —
 * `T-05.7` (`CST-41`), plan item `5.9` (`CA-F4-10`).
 *
 * SOURCE OF THE VALUES: `ADR-010` ("Governança de cor por TIPO DE MARCA"), which SUPERSEDES
 * `SPEC-001` §6.2. Every hex value below is copied from `ADR-010`'s `D-1`/`D-3` and from
 * `scripts/validate_palette.js`'s `PAPEIS` table (that script is the `docs`-owned instrument
 * that PROVES these values under dicromacia — `364de5e`-era `T-05.7` task refs: "MEDIDO
 * 2026-08-25: node scripts/validate_palette.js -> exit 0"). This module does not re-derive
 * or re-validate the arithmetic; it is the SECOND independent citation of the SAME numbers,
 * cross-checked against the script's own source text in `color-tokens.test.ts` (the same
 * "two call sites, one sha256" discipline `canonical-grid-sha256-proof.test.ts` uses for the
 * grid — here for a palette instead of a grid).
 *
 * SCOPE, and why this file does NOT carry `acao-*`/`foco` (`ADR-010`'s action/focus roles):
 * those are DOM chrome (buttons, focus rings) that `web` renders, never `charts` — `ADR-003`
 * FR-1 ("`charts` does no I/O and owns geometry only") and the `charts` <-> `web` import
 * boundary (`eslint.config.mjs`, `D5.12`) both say the same thing from different angles:
 * a canvas-drawn glyph token belongs here, a `<button>` token belongs to `web`. Bringing
 * `acao-*` in here would be scope creep this task's `refs` (`plano 05 item 5.9`, `CA-F4-10`)
 * do not ask for.
 *
 * THE ROLES THIS FILE DOES CARRY, and where each is drawn by `charts`:
 *   - `directionUpFill` / `directionDownFill` — the COLOR channel of price direction
 *     (`ADR-010/D-1`: "vive SÓ em fill", ties directly into the candlestick series this
 *     task wires in `s2-series-style.ts`). ⚠️ Since `T-01.10`'s `design_gate` these are no
 *     longer the only channel, and the correction is the point: direction ALSO travels as
 *     BODY GEOMETRY (hollow rise / filled fall, `ADR-010/D-2`), because two hues alone are
 *     `1,092:1` in grayscale and that reproves WCAG SC 1.4.1 at level A. See
 *     `candlestickSeriesColors` and `dojiItemColors` below.
 *   - `directionOn` — ink drawn ON TOP of a direction fill (a label inside a candle body,
 *     `ADR-010`'s `ON` type, piso 4.5:1 against the fill it sits on).
 *   - `dataBrokenInk` — integrity-of-data role (`ADR-010/D-3`): `ink` ONLY, never a fill.
 *     Not consumed by any `T-05.2` panel yet (the quarantine glyph is `T-05.3`+'s selo); the
 *     token exists now so that work composes on a named role instead of a bare hex later.
 *   - `provenanceStrong` / `provenanceWeak` — the procedência tinta ramp (`ADR-010/D-4`:
 *     "procedência não consome hue" — both are LUMINANCE-only, zero saturation).
 *
 * THE GUARD, and it is the point of `CA-F4-10`: `ColorRole` below is a CLOSED union. There
 * is no `"critical"` / `"severidade"` member — `ADR-010/D-5` is explicit that operational
 * severity ("coletor PAROU", `S1`, phase `07`) is NOT this role and carries NO color token,
 * ever. The absence is enforced twice: statically (the union simply has no such member, so
 * `colorTokens().critical` is a compile error) and at runtime
 * (`FORBIDDEN_COLOR_ROLE_SUBSTRINGS` + `assertNoForbiddenColorRoles`, exercised in
 * `color-tokens.test.ts` against a real violator so the guard is shown REJECTING something,
 * not just typechecking clean).
 *
 * ONE THEME, AND THE PARAMETER IS DELETED — `D13` of
 * `docs/context/cinco-metricas-do-core/handoff/DECISOES-OWNER.md`. This module used to take a
 * `mode: ColorMode` and carry a second, LIGHT palette. It no longer does: the app has one theme,
 * the dark one. The parameter was DELETED rather than re-pointed at `"dark"` — alternative `A`
 * ("trocar `light`->`dark` nos 4 sítios") was refused BY NAME because it leaves the trap armed,
 * and that trap had already sprung twice inside one file (`SymbolClient.tsx:296` and `:334`,
 * where the OI line was drawn `#131722` on a `#131722` surface: `1,00:1`, invisible in
 * production). With no parameter, that defect stops being a wrong argument and becomes
 * INEXPRESSIBLE.
 *
 * AND THE PALETTE NOW DECLARES WHAT EACH TOKEN IS MEASURED AGAINST: `CONTRAST_BACKDROP` below
 * pairs every role with the surface its contrast is computed on and the floor it must clear;
 * `color-contrast.test.ts` is the gate that reads it. That declaration — not a list of role
 * names a test agreed to skip — is what makes `directionOn` legitimately exempt from the surface
 * floor: it is ink drawn ON a candle body, so it is measured against the fills. A name-based
 * allowlist would have been the erosion pattern `CLAUDE.md` names ("entrada de allowlist é
 * indistinguível de bypass").
 */

export type ColorRole =
  | "directionUpFill"
  | "directionDownFill"
  | "directionOn"
  | "dataBrokenInk"
  | "provenanceStrong"
  | "provenanceWeak";

export type ColorTokens = Readonly<Record<ColorRole, string>>;

/**
 * Substrings that must NEVER appear in a `ColorRole` (case-insensitive). `ADR-010/D-5`:
 * operational severity is a role distinct from data integrity and carries no color token.
 * Checked at runtime by `assertNoForbiddenColorRoles` — the type system already refuses a
 * `ColorRole` member with these names, so this list is the belt to that union's braces: it
 * catches a future author who widens `ColorTokens` to `Record<string, string>` and loses the
 * closed-union guarantee without noticing.
 */
export const FORBIDDEN_COLOR_ROLE_SUBSTRINGS = ["critical", "severity", "severidade"] as const;

/**
 * Throws if any key of `roles` contains a forbidden substring. Pure, and takes `roles` as an
 * argument (not `ColorTokens` itself) so `color-tokens.test.ts` can feed it a deliberately
 * poisoned object and show the guard actually rejecting something — a guard exercised only
 * on data that already passes it proves nothing.
 */
export function assertNoForbiddenColorRoles(roles: readonly string[]): void {
  for (const role of roles) {
    const lowered = role.toLowerCase();
    for (const forbidden of FORBIDDEN_COLOR_ROLE_SUBSTRINGS) {
      if (lowered.includes(forbidden)) {
        throw new Error(
          `color role "${role}" carries a forbidden substring ("${forbidden}") — ADR-010/D-5: ` +
            `operational severity is not this role and gets no color token, ever (CA-F4-10).`,
        );
      }
    }
  }
}

/**
 * The one palette. Every hex is `ADR-010`'s `escuro` column, cross-checked hex for hex against
 * `scripts/validate_palette.js`'s `PAPEIS.escuro` in `color-tokens.test.ts`.
 *
 * ⚠️ `validate_palette.js` still carries a `claro` block, and that is CORRECT rather than
 * leftover: it is the `docs`-owned instrument for `ADR-010`'s dicromacia arithmetic, and `D13`
 * retired the light theme from the APP, not from the ADR. This module simply stopped citing
 * that column.
 */
const TOKENS: ColorTokens = {
  directionUpFill: "#089981",
  directionDownFill: "#f23645",
  directionOn: "#131722",
  dataBrokenInk: "#e0aaff",
  provenanceStrong: "#e6e9ef",
  provenanceWeak: "#8b949e",
};

/**
 * `--color-surface-base` of `frontend/src/app/globals.css`, cited here as a literal because
 * `charts` may not read the DOM (`ADR-003` FR-1 — the same purity that made `D13` refuse
 * alternative `C`, "derivar das CSS custom properties em runtime"). This is the SECOND citation
 * of that value, and `color-contrast.test.ts` reads `globals.css` as TEXT to prove the two have
 * not drifted — the same "two call sites, one number must match" discipline this file already
 * uses against `validate_palette.js` for the palette itself.
 */
export const SURFACE_BASE = "#131722";

/**
 * What a token is DRAWN ON, and therefore what its contrast must be measured against.
 *
 *   - `kind: "surface"` — painted straight onto `SURFACE_BASE` (the chart background).
 *   - `kind: "roles"` — painted ON TOP of another token's fill; measured against EVERY role
 *     listed, and the WORST of those ratios is the one that has to clear `minRatio`.
 */
export type ContrastBackdrop =
  | { readonly kind: "surface"; readonly minRatio: number }
  | { readonly kind: "roles"; readonly roles: readonly ColorRole[]; readonly minRatio: number };

/**
 * THE GATE'S INPUT (`D13`), and the reason it is a `Record<ColorRole, ...>` rather than an
 * allowlist: a member added to `ColorRole` without a line here is a TYPE ERROR, so no token can
 * enter this palette without its author stating what it is painted on. `directionOn`'s exemption
 * from the surface floor is therefore STRUCTURAL — it is not "skip this name", it is "this ink
 * sits on a candle body, so the candle body IS the backdrop".
 *
 * The floors, and where each comes from:
 *   - `3.0` against the surface — WCAG 1.4.11 (non-text contrast); `D13` made it a gate: no
 *     series token may sit below it against `--color-surface-base`.
 *   - `4.5` for `directionOn` — `ADR-010`'s `ON` type ("piso 4.5:1 against the fill it sits on"),
 *     already quoted in this file's module docstring. Stricter floor, different backdrop.
 *
 * ⚠️ `directionOn` measures `1,00:1` against the surface, and that is NOT a defect: it was
 * reported as one in design review and RETRACTED in `D13` ("Medi contra a referência errada").
 * Against the fills it is `5,01:1` (up) and `4,59:1` (down).
 */
export const CONTRAST_BACKDROP: Readonly<Record<ColorRole, ContrastBackdrop>> = {
  directionUpFill: { kind: "surface", minRatio: 3.0 },
  directionDownFill: { kind: "surface", minRatio: 3.0 },
  directionOn: { kind: "roles", roles: ["directionUpFill", "directionDownFill"], minRatio: 4.5 },
  dataBrokenInk: { kind: "surface", minRatio: 3.0 },
  provenanceStrong: { kind: "surface", minRatio: 3.0 },
  provenanceWeak: { kind: "surface", minRatio: 3.0 },
};

/**
 * The named tokens — the only way this module exposes a color to a caller. Takes NO argument:
 * `D13` left exactly one theme, so there is nothing left to select.
 */
export function colorTokens(): ColorTokens {
  return TOKENS;
}

/**
 * The interior of a RISING candle: fully transparent, so the body is HOLLOW and the only ink
 * on the rise is its border.
 *
 * ⛔ THIS IS THE NON-COLOR CHANNEL, AND IT IS WHY IT IS ALPHA RATHER THAN A DARKER HUE. The
 * gray ablation (`sed 's/089981/808080/g; s/f23645/808080/g'`) collapses every HUE onto one
 * value; it does not touch `rgba(0,0,0,0)`, because ALPHA IS NOT HUE. So a rise still emits a
 * body fill the fall does not, and the direction survives a screen with no color at all —
 * which is what WCAG SC 1.4.1 (level A) asks for and what `#089981` vs `#f23645` alone cannot
 * give: those two are `135` and `129` in grayscale, `1,092:1`, the same number `ADR-010:113`
 * publishes.
 */
export const HOLLOW_BODY_FILL = "rgba(0,0,0,0)";

/**
 * The 8 `CandlestickStyleOptions` fields `lightweight-charts` needs for `ADR-010/D-2`'s TWO
 * library-expressible states, built from the SAME 2 direction tokens — never a bare hex:
 *
 *   - RISE (`close > open`): body HOLLOW (`HOLLOW_BODY_FILL`), border and wick carrying
 *     `directionUpFill`. The rise is the only state that paints a transparent interior.
 *   - FALL (`close < open`): body FILLED with `directionDownFill`, border and wick the same
 *     token — one token, three places it paints, exactly as before.
 *
 * `borderVisible`/`wickVisible` are now STATED rather than left to the library default: with a
 * hollow up-body the border IS the rise's only ink, so `borderVisible: false` would erase the
 * rising candle entirely. A default that a future library release may change is not a thing to
 * rest an accessibility claim on.
 *
 * ⚠️ THE THIRD STATE IS NOT HERE, AND IT CANNOT BE — `dojiItemColors()` below. The library
 * resolves direction with `isUp = open <= close`
 * (`lightweight-charts@5.2.1`, `dist/lightweight-charts.development.mjs:2811`), so `open ===
 * close` falls into the RISING branch and there is no third option to set. The neutral doji is
 * therefore an override PER ITEM, applied by `candlestickSeriesLossless`.
 *
 * ⛔ `priceLineColor` IS NOT DECORATION HERE, IT IS THE REPAIR OF A DEFECT THE HOLLOW BODY
 * CREATES, and it was measured, not guessed. The last-value label on the price axis takes the
 * LAST BAR'S body color and strips its alpha —
 * `generateContrastColors`, `dist/lightweight-charts.development.mjs:406-412`, literal:
 * `` _internal_background: `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})` // no alpha ``. With a
 * transparent up-body that resolves to `rgb(0, 0, 0)` — an OPAQUE BLACK label, a color no
 * `ADR-010` role carries, on a `#131722` page. Reproduced in
 * `candle-direction-channel.test.ts` (the paint recorder logs `fill:rgb(0, 0, 0)` for a rising
 * last bar when this field is absent). `priceLineColor` short-circuits that path at its source
 * (`_internal_priceLineColor`, `:3415-3417`: `this._private__options.priceLineColor ||
 * lastBarColor`), for the price line AND for the axis label, in all three states at once.
 * `provenanceStrong` is the value because that label affirms A PRICE, not a direction, and
 * `ADR-010/D-4`'s procedência ramp is luminance-only — zero hue, so no direction is claimed
 * where none is meant.
 */
export function candlestickSeriesColors(): {
  readonly upColor: string;
  readonly downColor: string;
  readonly borderUpColor: string;
  readonly borderDownColor: string;
  readonly wickUpColor: string;
  readonly wickDownColor: string;
  readonly borderVisible: boolean;
  readonly wickVisible: boolean;
  readonly priceLineColor: string;
} {
  const tokens = colorTokens();
  return {
    upColor: HOLLOW_BODY_FILL,
    downColor: tokens.directionDownFill,
    borderUpColor: tokens.directionUpFill,
    borderDownColor: tokens.directionDownFill,
    wickUpColor: tokens.directionUpFill,
    wickDownColor: tokens.directionDownFill,
    borderVisible: true,
    wickVisible: true,
    priceLineColor: tokens.provenanceStrong,
  };
}

/**
 * THE THIRD STATE — the per-item override a DOJI (`open === close`) carries, so the screen
 * stops affirming a direction the data does not carry.
 *
 * `ADR-010:110`, literal: `CRUZ (doji) = close == open ⇒ DIREÇÃO NÃO AFIRMADA`. Without this
 * override the library paints the doji with `upColor`/`borderUpColor`/`wickUpColor` — byte for
 * byte the RISING candle — because its own branch is `open <= close`. That is not a poor
 * channel, it is a FALSE statement to an operator reading price.
 *
 * The value is `provenanceWeak` (`#8b949e`), and it is not a hue this module invented: it is
 * the token `ADR-010/D-4` already declares LUMINANCE-only (zero saturation ⇒ zero direction
 * hue), and it is the exact value the approved Stitch screen ships for the doji
 * (`docs/product/STITCH_CONTEXT.md:1257`, `bg-[#8b949e]`). Named token, not a literal, for the
 * same reason every other color here is.
 */
export function dojiItemColors(): {
  readonly color: string;
  readonly borderColor: string;
  readonly wickColor: string;
} {
  const neutral = colorTokens().provenanceWeak;
  return { color: neutral, borderColor: neutral, wickColor: neutral };
}
