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
 *   - `directionUpFill` / `directionDownFill` — the ONLY channel price direction may use
 *     (`ADR-010/D-1`: "vive SÓ em fill", ties directly into the candlestick series this
 *     task wires in `s2-series-style.ts`).
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
 * `colorTokens(mode).critical` is a compile error) and at runtime
 * (`FORBIDDEN_COLOR_ROLE_SUBSTRINGS` + `assertNoForbiddenColorRoles`, exercised in
 * `color-tokens.test.ts` against a real violator so the guard is shown REJECTING something,
 * not just typechecking clean).
 */

export type ColorMode = "light" | "dark";

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

const LIGHT: ColorTokens = {
  directionUpFill: "#089981",
  directionDownFill: "#f23645",
  directionOn: "#131722",
  dataBrokenInk: "#581c87",
  provenanceStrong: "#131722",
  provenanceWeak: "#57606a",
};

const DARK: ColorTokens = {
  directionUpFill: "#089981",
  directionDownFill: "#f23645",
  directionOn: "#131722",
  dataBrokenInk: "#e0aaff",
  provenanceStrong: "#e6e9ef",
  provenanceWeak: "#8b949e",
};

const TOKENS_BY_MODE: Readonly<Record<ColorMode, ColorTokens>> = { light: LIGHT, dark: DARK };

/** The named tokens for `mode` — the only way this module exposes a color to a caller. */
export function colorTokens(mode: ColorMode): ColorTokens {
  return TOKENS_BY_MODE[mode];
}

/**
 * The 6 `CandlestickStyleOptions` fields `lightweight-charts` needs, built from EXACTLY 2
 * tokens (`directionUpFill`/`directionDownFill`) — never a bare hex. `ADR-010/D-1`'s own
 * `FILL` definition lists "corpo/pavio de vela" (candle body AND wick) as the same type of
 * mark, so wick and border reuse the fill token rather than inventing a third hue per
 * direction: one token, one role, three places it paints (body/border/wick) — no ad hoc
 * color is introduced by this function.
 *
 * `wickVisible`/`borderVisible` are left at the library default (`true`) — this task's
 * `refs` ask for a NAMED-BY-ROLE color, not a candle-shape redesign (`ADR-010/D-2`'s hollow/
 * filled body is a separate, later concern; see this file's module docstring for why it is
 * out of scope here).
 */
export function candlestickSeriesColors(mode: ColorMode): {
  readonly upColor: string;
  readonly downColor: string;
  readonly borderUpColor: string;
  readonly borderDownColor: string;
  readonly wickUpColor: string;
  readonly wickDownColor: string;
} {
  const tokens = colorTokens(mode);
  return {
    upColor: tokens.directionUpFill,
    downColor: tokens.directionDownFill,
    borderUpColor: tokens.directionUpFill,
    borderDownColor: tokens.directionDownFill,
    wickUpColor: tokens.directionUpFill,
    wickDownColor: tokens.directionDownFill,
  };
}
