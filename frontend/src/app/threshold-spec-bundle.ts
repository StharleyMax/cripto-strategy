/**
 * `T-08.5` — the versioned, hashable `ThresholdSpec` bundle. It IS the URL, not a CRUD
 * resource: there is no server-side preset store here, by design (`SPEC-001` §7: "o bundle
 * de parametros e versionado e hasheavel, e ele E a URL — nao um CRUD. Gerenciador de
 * presets e produto prematuro e non-goal.").
 *
 * Sources fixing the contract, in order:
 *   - `docs/specs/SPEC-001-plataforma-dados.md:292-295` (§3.7) — the sum type itself:
 *     `ThresholdSpec = Absolute{pct, op} | Percentile{q, window, scope, min_obs,
 *     interpolation, op} | RobustZ{k, window, min_obs, op} + spec_version + Custom{expr}
 *     DESABILITADO por padrao`.
 *   - `docs/specs/SPEC-001-plataforma-dados.md:303` — "`ThresholdSpec` sem default em
 *     nenhum eixo. O operador vale 20x": `|r| > 0.0001` fires 9/1500 windows, `|r| >= 0.0001`
 *     fires 184/1500 — the SAME data, a 20x different verdict, from `op` alone.
 *   - `docs/specs/SPEC-001-plataforma-dados.md:304` — "`min_obs` nao atendido => AUSENCIA
 *     (`—`), nunca `expanding` em silencio." This module does not implement that
 *     runtime rule (`T-08.7`'s job); it only guarantees the bundle CARRIES `minObs` explicit
 *     enough for that rule to exist downstream — by TYPE, `minObs` cannot be omitted on a
 *     variant that requires it.
 *   - `docs/specs/SPEC-001-plataforma-dados.md:560-568` (§7) — reproducibility:
 *     `reproduzir(run) = (bundle_hash, window, knowledge_time)`.
 *   - `docs/plans/SPEC-001-plataforma-dados/08_superficie_e_reprodutibilidade.md`, item 8.4 /
 *     `DoD D8.3`: "carregar a tela sem `ThresholdSpec` na URL -> ZERO numeros derivados" —
 *     the mandatory negative test this module has to make true by construction.
 *
 * Precedent this module follows in FORM, not field-for-field (`docs/context/plataforma-dados/
 * handoff/T-08.5.md`): `frontend/src/app/knowledge-time-bundle.ts` (`T-05.8`) — same family
 * of contract (versioned/hashable bundle, zero default, mandatory negative test), different
 * domain.
 *
 * Design gate (`docs/context/plataforma-dados/gates/T-08.5-design.md`): `S4`, the only screen
 * that would ever render this bundle, does not exist yet (`T-08.6`, not started). There is no
 * UI decision for this module to converge against — it ships the data contract only.
 */

import { createHash } from "node:crypto";

/**
 * Comparison operator. `SPEC-001:303` only exercises `>` and `>=` to measure the 20x gap,
 * but a threshold naturally compares in both directions (a spike UP and a spike DOWN are
 * both legitimate alerts) — `<` and `<=` complete the same, ordinary mathematical
 * vocabulary the SPEC's own two examples are drawn from. This is NOT invented domain
 * vocabulary: it is the closed set every one of the four symbols belongs to.
 */
export type Operator = ">" | ">=" | "<" | "<=";
const OPERATORS: readonly Operator[] = [">", ">=", "<", "<="];

/**
 * `numpy.percentile`'s own `interpolation` parameter values — chosen because `SPEC-001:305`
 * discusses `numpy.percentile` directly in the same clause that names this field
 * `interpolation`, and because the SPEC's own regression test (`SPEC-001:305`) fixes the
 * estimator precisely because "percentil sem estimador mente" (`PRD-001:983`). `[INFERRED:
 * field name and adjacent SPEC prose both point at numpy's own vocabulary for this axis]`.
 */
export type Interpolation = "linear" | "lower" | "higher" | "nearest" | "midpoint";
const INTERPOLATIONS: readonly Interpolation[] = ["linear", "lower", "higher", "nearest", "midpoint"];

/**
 * `Absolute{pct, op}` — a fixed threshold on the raw value.
 */
export interface AbsoluteSpec {
  readonly variant: "absolute";
  readonly pct: number;
  readonly op: Operator;
}

/**
 * `Percentile{q, window, scope, min_obs, interpolation, op}` — a threshold expressed as a
 * percentile of a rolling population. `scope` is typed as a non-empty string, not a closed
 * enum: the corpus (`grep -rn "scope" docs/specs docs/adr`) only ever exercises ONE value
 * (`CrossSection`, `docs/adr/ADR-001-quantity-field-na-identidade.md:27`) and never
 * documents a second — closing the enum here would invent domain vocabulary this task does
 * not own. What `D8.3`/`SPEC-001:303` actually require ("sem default em nenhum eixo") is
 * presence, which the type below still enforces.
 */
export interface PercentileSpec {
  readonly variant: "percentile";
  readonly q: number;
  readonly window: number;
  readonly scope: string;
  readonly minObs: number;
  readonly interpolation: Interpolation;
  readonly op: Operator;
}

/**
 * `RobustZ{k, window, min_obs, op}` — a threshold expressed as a robust z-score multiple.
 */
export interface RobustZSpec {
  readonly variant: "robust_z";
  readonly k: number;
  readonly window: number;
  readonly minObs: number;
  readonly op: Operator;
}

/**
 * The three enabled variants of `ThresholdSpec`. `Custom{expr}` is part of the sum type in
 * `SPEC-001:292-295` but disabled by default — see `CustomSpec` and `decodeThresholdSpec`
 * below for how that is enforced.
 */
export type ThresholdSpec = AbsoluteSpec | PercentileSpec | RobustZSpec;

/**
 * `Custom{expr}` — kept as a documented shape (so the sum type in `SPEC-001:292-295` is
 * faithfully represented), but deliberately EXCLUDED from `ThresholdSpec`: no function in
 * this module accepts, produces, or decodes a `CustomSpec`. `decodeThresholdSpec` refuses a
 * `variant=custom` token on the URL explicitly, by name, rather than falling through to a
 * generic "unknown variant" message — a future task that lifts this restriction has to
 * change this module on purpose, not by accident of a wider `switch`.
 */
export interface CustomSpec {
  readonly variant: "custom";
  readonly expr: string;
}

/** Bundle format version — the "+ spec_version" member of the `SPEC-001:292-295` sum type. */
export const CURRENT_THRESHOLD_SPEC_VERSION = 1;

/**
 * The bundle: a `ThresholdSpec` paired with the format version it was encoded under. This is
 * the value that is versioned and hashable, and that is the URL (`SPEC-001:568`).
 */
export interface ThresholdSpecBundle {
  readonly specVersion: number;
  readonly spec: ThresholdSpec;
}

/** Stable query-parameter order, so the same bundle always produces the same URL string. */
const PARAM_ORDER = [
  "specVersion",
  "variant",
  "pct",
  "op",
  "q",
  "window",
  "scope",
  "minObs",
  "interpolation",
  "k",
] as const;

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`invalid ThresholdSpec: field "${field}" must be a finite number, got ${JSON.stringify(value)}`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid ThresholdSpec: field "${field}" must be a positive integer, got ${JSON.stringify(value)}`);
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`invalid ThresholdSpec: field "${field}" cannot be empty`);
  }
}

function assertOperator(value: Operator, field: string): void {
  if (!OPERATORS.includes(value)) {
    throw new Error(
      `invalid ThresholdSpec: field "${field}" must be one of ${JSON.stringify(OPERATORS)}, got ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Validates a `ThresholdSpec` before it becomes a URL. No axis is allowed a default here —
 * this is the runtime half of what the discriminated union already enforces at compile
 * time: a `PercentileSpec`/`RobustZSpec` object that is missing `minObs` does not TYPE-CHECK
 * in the first place, so this function's job is bounding the VALUES each present axis may
 * take, not re-checking presence TypeScript already guarantees.
 */
export function assertValidThresholdSpec(spec: ThresholdSpec): void {
  assertOperator(spec.op, "op");
  if (spec.variant === "absolute") {
    assertFiniteNumber(spec.pct, "pct");
    return;
  }
  if (spec.variant === "percentile") {
    assertFiniteNumber(spec.q, "q");
    if (!(spec.q > 0 && spec.q < 100)) {
      throw new Error(`invalid ThresholdSpec: field "q" must satisfy 0 < q < 100, got ${JSON.stringify(spec.q)}`);
    }
    assertPositiveInteger(spec.window, "window");
    assertNonEmptyString(spec.scope, "scope");
    assertPositiveInteger(spec.minObs, "minObs");
    if (spec.minObs > spec.window) {
      throw new Error(
        `invalid ThresholdSpec: "minObs" (${spec.minObs}) cannot exceed "window" (${spec.window}) — ` +
          "a window can never observe more points than it holds (SPEC-001:304's own example: " +
          "rolling(2016, min_periods=576) has min_periods < window).",
      );
    }
    if (!INTERPOLATIONS.includes(spec.interpolation)) {
      throw new Error(
        `invalid ThresholdSpec: field "interpolation" must be one of ${JSON.stringify(INTERPOLATIONS)}, got ${JSON.stringify(spec.interpolation)}`,
      );
    }
    return;
  }
  // spec.variant === "robust_z"
  assertFiniteNumber(spec.k, "k");
  if (!(spec.k > 0)) {
    throw new Error(`invalid ThresholdSpec: field "k" must be > 0, got ${JSON.stringify(spec.k)}`);
  }
  assertPositiveInteger(spec.window, "window");
  assertPositiveInteger(spec.minObs, "minObs");
  if (spec.minObs > spec.window) {
    throw new Error(`invalid ThresholdSpec: "minObs" (${spec.minObs}) cannot exceed "window" (${spec.window})`);
  }
}

/** Validates the whole bundle: the spec itself, plus the version it claims to be. */
export function assertValidBundle(bundle: ThresholdSpecBundle): void {
  assertPositiveInteger(bundle.specVersion, "specVersion");
  assertValidThresholdSpec(bundle.spec);
}

/**
 * The bundle becomes URL parameters field by field — not a serialized blob — so the URL
 * stays readable and linkable by a human, matching `knowledge-time-bundle.ts`'s own
 * precedent for `SPEC-001:568` ("o bundle e a URL").
 */
export function encodeBundle(bundle: ThresholdSpecBundle): URLSearchParams {
  assertValidBundle(bundle);
  const spec = bundle.spec;
  const raw: Record<(typeof PARAM_ORDER)[number], string | undefined> = {
    specVersion: String(bundle.specVersion),
    variant: spec.variant,
    pct: spec.variant === "absolute" ? String(spec.pct) : undefined,
    op: spec.op,
    q: spec.variant === "percentile" ? String(spec.q) : undefined,
    window: spec.variant === "percentile" || spec.variant === "robust_z" ? String(spec.window) : undefined,
    scope: spec.variant === "percentile" ? spec.scope : undefined,
    minObs: spec.variant === "percentile" || spec.variant === "robust_z" ? String(spec.minObs) : undefined,
    interpolation: spec.variant === "percentile" ? spec.interpolation : undefined,
    k: spec.variant === "robust_z" ? String(spec.k) : undefined,
  };
  const params = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = raw[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

function requireParam(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (value === null) {
    throw new Error(`invalid ThresholdSpec bundle: required parameter "${name}" is missing from the URL`);
  }
  return value;
}

function requireNumberParam(params: URLSearchParams, name: string): number {
  const raw = requireParam(params, name);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`invalid ThresholdSpec bundle: parameter "${name}" is not a number: ${JSON.stringify(raw)}`);
  }
  return value;
}

function requireOperatorParam(params: URLSearchParams): Operator {
  const raw = requireParam(params, "op");
  if (!OPERATORS.includes(raw as Operator)) {
    throw new Error(`invalid ThresholdSpec bundle: parameter "op" must be one of ${JSON.stringify(OPERATORS)}, got ${JSON.stringify(raw)}`);
  }
  return raw as Operator;
}

/**
 * The inverse of `encodeThresholdSpec` below. This is what makes `D8.3` true: a URL that
 * does not carry a `variant` parameter (or any other required axis) is REFUSED, never
 * completed with an assumed value — "carregar a tela sem `ThresholdSpec` na URL -> ZERO
 * numeros derivados" is only true if decoding throws instead of guessing.
 */
export function decodeThresholdSpec(params: URLSearchParams): ThresholdSpec {
  const variant = requireParam(params, "variant");

  if (variant === "custom") {
    throw new Error(
      'invalid ThresholdSpec bundle: variant "custom" is disabled by default (SPEC-001 §3.7: ' +
        '"Custom{expr} DESABILITADO por padrao") — Custom{expr} cannot be decoded in this version',
    );
  }

  if (variant === "absolute") {
    const spec: AbsoluteSpec = {
      variant: "absolute",
      pct: requireNumberParam(params, "pct"),
      op: requireOperatorParam(params),
    };
    assertValidThresholdSpec(spec);
    return spec;
  }

  if (variant === "percentile") {
    const spec: PercentileSpec = {
      variant: "percentile",
      q: requireNumberParam(params, "q"),
      window: requireNumberParam(params, "window"),
      scope: requireParam(params, "scope"),
      minObs: requireNumberParam(params, "minObs"),
      interpolation: requireParam(params, "interpolation") as Interpolation,
      op: requireOperatorParam(params),
    };
    assertValidThresholdSpec(spec);
    return spec;
  }

  if (variant === "robust_z") {
    const spec: RobustZSpec = {
      variant: "robust_z",
      k: requireNumberParam(params, "k"),
      window: requireNumberParam(params, "window"),
      minObs: requireNumberParam(params, "minObs"),
      op: requireOperatorParam(params),
    };
    assertValidThresholdSpec(spec);
    return spec;
  }

  throw new Error(
    `invalid ThresholdSpec bundle: parameter "variant" must be one of ["absolute", "percentile", "robust_z"], got ${JSON.stringify(variant)}`,
  );
}

/** Decodes the whole bundle: the version, then the spec it claims to encode. */
export function decodeBundle(params: URLSearchParams): ThresholdSpecBundle {
  const specVersion = requireNumberParam(params, "specVersion");
  if (specVersion !== CURRENT_THRESHOLD_SPEC_VERSION) {
    throw new Error(
      `invalid ThresholdSpec bundle: unsupported specVersion ${JSON.stringify(specVersion)} — this module only ` +
        `decodes version ${CURRENT_THRESHOLD_SPEC_VERSION}; guessing a mapping for an unknown version would be ` +
        "exactly the silent default D8.3 forbids",
    );
  }
  const spec = decodeThresholdSpec(params);
  const bundle: ThresholdSpecBundle = { specVersion, spec };
  assertValidBundle(bundle);
  return bundle;
}

/** `bundleUrl`/`parseBundleFromUrl` close the loop: the bundle only ever exists as a URL. */
export function bundleUrl(base: URL | string, bundle: ThresholdSpecBundle): URL {
  const url = new URL(base);
  url.search = encodeBundle(bundle).toString();
  return url;
}

export function parseBundleFromUrl(url: URL | string): ThresholdSpecBundle {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return decodeBundle(parsed.searchParams);
}

/**
 * The bundle's content hash — the "hasheavel" half of `SPEC-001:568`. Hashing the CANONICAL
 * query string (stable field order, from `encodeBundle`) rather than an ad hoc
 * `JSON.stringify` keeps the hash a pure function of the same bytes that would appear in a
 * shared link: two bundles that produce the same URL always produce the same hash, and
 * changing ANY axis — including `op`, the one `SPEC-001:303` measures at 20x — changes it.
 */
export function bundleHash(bundle: ThresholdSpecBundle): string {
  const canonical = encodeBundle(bundle).toString();
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
