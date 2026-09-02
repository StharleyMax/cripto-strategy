/**
 * `T-07.12` — domain model of the `S1` console (collection & retention diagnostics).
 *
 * Sources, in this order:
 *   - `docs/plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md`, item `7.13` and
 *     `DoD D7.12`-`D7.15`: `janela_de_perda` is a FORMULA per series (never a constant),
 *     the resilience trail multiplies the P1 SLO budget by `~4.7x` when trailing 5m instead
 *     of 1m, retention is anticorrelated with need (the liquidation series is SPARSE and its
 *     window SHRINKS during a cascade — the one regime where it matters), and reconnection
 *     is ROUTINE, never an alarm.
 *   - `docs/product/STITCH_CONTEXT.md` §4.2 / §9 item 5 (`D17`): severity is communicated by
 *     ROW POSITION and GLYPH, never by color — the stopped collector sorts first, every
 *     status badge shares one neutral class.
 *   - The canonical screen, `S1 Console — Diagnóstico Operacional (Rev. B)`,
 *     `screens/c0fc0210272f42a1ae29b6364e68d2e4`, approved by the independent
 *     `ux-ui-mastery` gate (`docs/context/plataforma-dados/gates/T-07.12-ux-critique.md`).
 *
 * ── SCOPE: this is a headless data/formula module, same tier as `T-05.8`/`T-05.9`
 *    (`src/app/knowledge-time-bundle.ts`, `src/app/history-transport.ts`) ──────────────────
 *
 * `frontend/README.md` §1 and `src/app/routes.ts` both record that this directory is NOT the
 * Next.js application yet — that scaffold belongs to a different task. There is no React
 * dependency, no `tsconfig.json`, no renderer installed in this package
 * (`[MEDIDO 2026-09-02: grep -c '"react"' frontend/package-lock.json -> 0]`). Translating the
 * approved screen here means translating its DATA MODEL and its FORMULAS into typed,
 * falsifiable TypeScript — the presentational half (`S1Console.tsx`) follows the same
 * lint-only pattern `src/features/panel/Filter.tsx` already established in this repository,
 * not a wired, running page.
 *
 * ── GAP, registered and not hidden ──────────────────────────────────────────────────────
 *
 * The real data source for this screen is the named query `ingest_health_query`
 * (`ADR-008/D3`), and wiring it is `T-07.13` — explicitly a DIFFERENT task
 * (`depends_on = ["T-02.3", "T-07.12"]`, `tasks.toml:960`). Every number this module and
 * `fixtures.ts` produce is FIXTURE/SYNTHETIC, chosen to be internally consistent and to
 * reproduce the DoD's published figures — never read from a database. See `fixtures.ts` for
 * the per-field provenance of each value.
 */

/**
 * How a series' `janela_de_perda` (loss window, in days) is known.
 *
 * `D7.12` is explicit that this is a FORMULA, not one constant across the board — and the
 * five variants below are the five distinct ways the DoD actually observed it:
 *   - `computed_uniform`  — Coinalyze grade series with a uniform cadence: `pontos × intervalo`
 *     gives the window directly (OI 1m, OI 5m).
 *   - `measured_sparse`   — same "points at a grade" shape, but the series is SPARSE (D7.14):
 *     points are not evenly spaced, so `pontos × intervalo` is not the window — the window is
 *     an independently measured fact, and it is not guaranteed to hold in every regime
 *     (liquidation 1m; it shrinks during exactly the cascade regime where it matters).
 *   - `doc_only`          — no purge policy exists; the window is not a number
 *     (liquidation daily roll-up).
 *   - `declared_constant` — a fixed retention window set by the provider's own documentation,
 *     not derived from a point count (kept for completeness; not used by any `S1` row today).
 *   - `unmeasured`        — retention is presumed re-downloadable but was never measured, and
 *     it is never allowed to read as "infinite" (the S3 raw dump).
 *   - `not_applicable`    — the collector itself is stopped; the concept does not apply.
 */
export type RetentionWindow =
  | {
      readonly kind: "computed_uniform";
      readonly points: number;
      readonly intervalMinutes: number;
      readonly days: number;
    }
  | {
      readonly kind: "measured_sparse";
      readonly points: number;
      readonly intervalMinutes: number;
      readonly days: number;
      /** The D7.14 microcopy: never a bare number for a sparse series. */
      readonly regimeNote: string;
    }
  | { readonly kind: "doc_only" }
  | { readonly kind: "declared_constant"; readonly days: number }
  | { readonly kind: "unmeasured" }
  | { readonly kind: "not_applicable" };

/** Minutes in a calendar day — the only unit conversion this module needs. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * The deterministic half of `D7.12`: for a series with a UNIFORM cadence, the loss window is
 * literally `points × intervalMinutes`, converted to days. Throws rather than returning a
 * nonsensical window for non-positive input — a retention window of zero or negative points
 * is not a smaller window, it is an invalid measurement.
 */
export function computeUniformWindowDays(points: number, intervalMinutes: number): number {
  if (!(points > 0)) {
    throw new RangeError(`points precisa ser positivo, recebi ${points}`);
  }
  if (!(intervalMinutes > 0)) {
    throw new RangeError(`intervalMinutes precisa ser positivo, recebi ${intervalMinutes}`);
  }
  return (points * intervalMinutes) / MINUTES_PER_DAY;
}

/** Builds a `computed_uniform` window, keeping `points`/`intervalMinutes`/`days` in sync. */
export function makeComputedUniformWindow(
  points: number,
  intervalMinutes: number,
): Extract<RetentionWindow, { kind: "computed_uniform" }> {
  return {
    kind: "computed_uniform",
    points,
    intervalMinutes,
    days: computeUniformWindowDays(points, intervalMinutes),
  };
}

/**
 * The declared figure from `D7.13`: trailing 5m instead of 1m multiplies the P1 SLO budget by
 * approximately this factor. It is carried here as a NAMED constant (not inlined in
 * `fixtures.ts`) so a future change to the plan's own number is a one-line diff, not a
 * search-and-replace across every row that cites it.
 */
export const DECLARED_SLO_TRAIL_MULTIPLIER = 4.7;

/**
 * Independent check on `DECLARED_SLO_TRAIL_MULTIPLIER`: given the 1m and 5m windows of the
 * SAME underlying series, what ratio do they actually imply? This is a verification helper,
 * not the source of truth — the multiplier the screen displays is the declared constant
 * above, and the two are expected to round to the same first decimal, not to be bit-identical
 * (the constant is a plan-level rounding of a slightly different precise ratio).
 */
export function resilienceMultiplierFromWindows(days1m: number, days5m: number): number {
  if (!(days1m > 0)) {
    throw new RangeError(`days1m precisa ser positivo, recebi ${days1m}`);
  }
  return days5m / days1m;
}

/**
 * How a row's resilience trail reads. `slo_multiplier` is by far the common case; the other
 * three cover the rows where the SLO-trail question does not apply the same way.
 *
 * `[NÃO SEI]`, registered and not resolved here: the approved screen shows the identical
 * `~4.7x` on every `T1m` row (`OI · grade 1m` and `Liq · grade 1m` alike), which the
 * independent gate flagged as an open ambiguity (`T-07.12-ux-critique.md`, "achado 4") and
 * the coordinator explicitly instructed NOT to touch in this round. This module reproduces
 * that same reuse rather than inventing a per-series multiplier the gate never validated.
 */
export type ResilienceLabel =
  | { readonly kind: "slo_multiplier"; readonly grade: "T1m" | "T5m"; readonly multiplier: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "not_scored" }
  | { readonly kind: "external_sla"; readonly label: string };

/** The four statuses the approved screen shows — no fifth exists in the DoD or the mockup. */
export type CollectorStatus = "ATIVO" | "PARADO" | "ARQUIVO" | "PENDENTE";

/**
 * The ONE badge class every status uses. This is the falsifier for `D17`
 * (`STITCH_CONTEXT.md` §9 item 5, "a regra que mais escapa"): severity is read from ROW
 * POSITION (the stopped collector sorts to the top, see `orderRowsBySeverity`) and from an
 * accompanying glyph, never from color. A reviewer who wants to prove this regressed need
 * only show a SECOND class string somewhere in this module — there is exactly one.
 */
export const NEUTRAL_STATUS_BADGE_CLASS =
  "bg-surface-border text-provenance-strong px-2 py-0.5 font-label-caps text-label-caps";

/** The only glyph the screen ever shows, and only on the stopped row — position and glyph
 * carry severity, per `D17`, so a status without a stop condition carries none. */
export const STOPPED_STATUS_GLYPH = "stop_circle";

export function badgeClassForStatus(status: CollectorStatus): string {
  // The exhaustive switch is the point, not decoration: it is a compile-time reminder that
  // a FIFTH status would need a branch here, and every branch existing today returns the
  // same constant — the falsifier lives in `domain.test.ts`.
  switch (status) {
    case "ATIVO":
    case "PARADO":
    case "ARQUIVO":
    case "PENDENTE":
      return NEUTRAL_STATUS_BADGE_CLASS;
  }
}

/** One row of "Monitoramento de Coletores e Ingestão". */
export interface CollectorRow {
  readonly series: string;
  readonly retention: RetentionWindow;
  readonly resilience: ResilienceLabel;
  readonly status: CollectorStatus;
  /** `null` when the screen shows "-" instead of a percentage (stopped or archived rows). */
  readonly uptimePercent: number | null;
  /** Free-form status-cell detail the mockup shows next to some badges (e.g. "3k obj"). */
  readonly statusDetail: string | null;
}

/**
 * `D17`, positive case: the stopped collector sorts FIRST, by position — never by a red
 * badge. A stable partition (not a comparator sort) so ties among non-stopped rows keep the
 * order the caller gave them.
 */
export function orderRowsBySeverity(rows: readonly CollectorRow[]): CollectorRow[] {
  const stopped = rows.filter((row) => row.status === "PARADO");
  const rest = rows.filter((row) => row.status !== "PARADO");
  return [...stopped, ...rest];
}

/** One line of "Orçamento Armazenamento (GB/dia)". `gbPerDay` is `null` for a collector that
 * is `PARADO` — a stopped collector has no forward storage budget, and `null` says that
 * directly instead of a silently-summed zero. */
export interface StorageBudgetLine {
  readonly label: string;
  readonly gbPerDay: number | null;
}

/**
 * The arithmetic half of "orçamento aritmético": the total is the SUM of the active lines,
 * computed here rather than hand-typed on the fixture — the DoD title names this "orçamento
 * aritmético" precisely because the total has to reconcile with its parts, not just be
 * plausible next to them.
 */
export function totalStorageBudgetGbPerDay(lines: readonly StorageBudgetLine[]): number {
  return lines.reduce((sum, line) => sum + (line.gbPerDay ?? 0), 0);
}

/**
 * One line of "Reconexões e Rotina" (`D7.15`). Deliberately has NO severity/level/isError
 * field: the DoD requires a 24h disconnect to read as ROUTINE, not as an alarm, and a type
 * that carried a severity flag would be exactly the seam a later edit could use to
 * reintroduce color-by-kind. This is the same absence-by-type trick
 * `src/app/knowledge-time-bundle.ts`'s `LiveBundle`/`AsOfBundle` uses for `knowledgeTime`: a
 * `WS drop` and a `WS resume` are the SAME kind of value, not two branches of a union that
 * happen to look alike today.
 */
export interface ReconnectionEvent {
  readonly time: string;
  readonly description: string;
  readonly durationLabel: string;
}
