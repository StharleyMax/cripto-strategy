/**
 * `T-07.14` — TypeScript port of `universe_at(ts, filter)`, plus a NEW extension this task
 * adds (the delisting badge) that has no Python counterpart.
 *
 * `S5` is not a screen (`SPEC-001` §6, `docs/product/STITCH_CONTEXT.md:136`): it is
 * `universe_at(ts, filtro)` embedded behind whatever symbol selector another screen builds
 * (`docs/context/plataforma-dados/gates/T-07.14-design.md`: no screen has a real selector
 * built yet, so there is no UI decision pending here — this module ships the data contract
 * only, same posture `threshold-spec-bundle.ts` (`T-08.5`) took for `S4`).
 *
 * NORMATIVE SOURCE — read, never edited (`backend/` is off limits per `CLAUDE.md`):
 * `backend/src/modules/sentimento/domain/universe_at.py`. It is pure domain logic (`ADR-016`,
 * "Natureza": no socket, no clock, no file) — reimplementing the algorithm here, citing the
 * source, is the sanctioned path (same family as `T-08.5`'s own precedent comment); there is
 * no CLI to shell out to (`T-07.8`'s own builder handoff: "não escreve o use_case/CLI que lê
 * snapshot real e chama `universe_at`").
 *
 * THE CENTRAL RULE THIS PORTS, verbatim from the Python docstring: `UniverseSource` has three
 * members (`SPEC-001` §3.7), but `DecisiveUniverseSource` — the type
 * `decideUniverseMembership` accepts — has only two, `s3_inferred` EXCLUDED BY TYPE. Python
 * enforces this with `mypy --strict` on a `Literal` union; TypeScript has no `mypy --strict`
 * gate wired into this repository's `frontend/eslint.config.mjs` (no type-aware, no
 * `tsc --noEmit` script exists today — `[MEDIDO 2026-09-02: grep -n '"typecheck"\|project:'
 * frontend/package.json frontend/eslint.config.mjs → 0 linhas]`), but the discriminated union
 * still plays the same role a caller relies on: no value typed `DecisiveUniverseSource` can be
 * the string `"s3_inferred"`, so `decideUniverseMembership`'s parameter type has no key to
 * assign one under. Verified once by hand, the same division of labour
 * `test_universe_at.py`'s own comment describes for `mypy` (no `tsconfig.json` exists in
 * `frontend/` today — `[MEDIDO 2026-09-02: ls frontend/tsconfig.json → No such file or
 * directory]` — hence the explicit `--lib`/`--target` below instead of a project file):
 *
 *   $ printf 'import type { DecisiveUniverseSource } from "./universe-at.ts";\n' \
 *       'const bad: DecisiveUniverseSource = "s3_inferred";\n' > /tmp/scratch_bad.ts
 *   $ node_modules/.bin/tsc --noEmit --strict --lib es2020 --target es2020 \
 *       --moduleResolution bundler /tmp/scratch_bad.ts
 *   src/app/universe-at.ts(...): error TS2322: Type '"s3_inferred"' is not assignable to
 *   type 'DecisiveUniverseSource'.
 *   `[MEDIDO 2026-09-02, rodado de dentro de frontend/]`
 *
 * `universe-at.test.ts` proves the RUNTIME half — the same falsifier discipline
 * `test_universe_at.py` applies via `ast`, done here via `Function.prototype.toString()`
 * (source text survives Node's type-stripping, unlike Python's `inspect.getsource`, which is
 * why this reaches for the JS-native tool instead of porting the `ast` module's approach).
 *
 * THE EXTENSION — the delisting badge, which `T-07.8` never built:
 * `InstrumentRow` (backend `T-02.1`) has NO `deliveryDate` field
 * (`backend/src/modules/sentimento/domain/instrument_universe_snapshot.py`, grepped, absent;
 * confirmed again by `docs/context/plataforma-dados/handoff/T-07.14.md`, "`InstrumentRow`
 * ... NÃO tem campo `deliveryDate`"), so the badge cannot come from the same rows
 * `universeAt` decides membership from — it has to read the RAW `exchangeInfo` capture
 * directly (`data/snapshots/2026-08-25_exchangeInfo.json`, catalogued in `data/MANIFEST.md`).
 * `DELISTING_SENTINEL_DELIVERY_DATE` is the value measured directly in that file — 743/877
 * entries in the raw file carry it, and every one of `ICXUSDT`/`STORJUSDT`/`SCRTUSDT` carries
 * `1787734800000` instead (`[MEDIDO 2026-09-02: python3 -c "... Counter(s['deliveryDate'] for
 * s in json.load(open('data/snapshots/2026-08-25_exchangeInfo.json'))['symbols'])"]`, see the
 * QA gate block for the literal command). Do not re-derive the sentinel by any other path.
 *
 * `stampUniverseRows` is the "`universe_source` carimbado em toda saída" requirement, literal
 * from the task title: every row this module hands to a caller carries the union of
 * `UniverseSource` values that attested the symbol (never a silent merge — the same
 * `divergence`-is-data posture `universe_at.py` already takes), plus the badge.
 */

// ── The three-member vocabulary, and the two-member DECISIVE subset (SPEC-001 §3.7) ────────

export type UniverseSource = "snapshot" | "s3_inferred" | "premium_index_witness";

/**
 * The admissible subset `decideUniverseMembership` accepts — no `s3_inferred` member AT ALL.
 * See the module docstring above for why this is a type-level fence, not a runtime `if`.
 */
export type DecisiveUniverseSource = "snapshot" | "premium_index_witness";

export const SNAPSHOT: DecisiveUniverseSource = "snapshot";
export const PREMIUM_INDEX_WITNESS: DecisiveUniverseSource = "premium_index_witness";
/** Typed `UniverseSource`, deliberately NOT `DecisiveUniverseSource` — mirrors `universe_at.py`. */
export const S3_INFERRED: UniverseSource = "s3_inferred";

/**
 * `PRD-001` line 613, literal (quoted by `universe_at.py` too): "universo retrospectivo
 * (s3_inferred) — não é o universo conhecível em t".
 */
export const RETROSPECTIVE_LABEL = "retrospective_before_first_snapshot";

// ── The minimal snapshot-witness row this module's algorithm actually reads ────────────────
//
// This is NOT a full port of `InstrumentRow` (`instrument_universe_snapshot.py` has three more
// fields — `fundingIntervalHours`, `interestRate` — that neither `UniverseFilter` nor
// `universeAt` ever reads). Porting fields nothing here consumes would be scope this task does
// not own; `buildSnapshotWitnessRows` below joins only the two sources `market` derivation
// needs (`exchangeInfo`, `fundingInfo`), the same join `build_instrument_rows` performs.

export const MARKET_USDS_M = "USDS_M";
export const MARKET_COIN_M = "COIN_M";

export interface SnapshotWitnessRow {
  readonly symbol: string;
  readonly market: string;
  /** `null` = no `exchangeInfo` row this capture (an absence of OBSERVATION, not of tag). */
  readonly underlyingSubType: readonly string[] | null;
}

// ── `UniverseFilter` — a read-time filter, `SPEC-001` §6/Q5 ────────────────────────────────

export interface UniverseFilter {
  /** `undefined` = "does not filter this axis", never "match rows with no market". */
  readonly market?: string;
  readonly underlyingSubType?: readonly string[];
}

export const NO_FILTER: UniverseFilter = {};

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Return whether `row` survives every axis `filter` constrains. */
export function filterMatches(filter: UniverseFilter, row: SnapshotWitnessRow): boolean {
  if (filter.market !== undefined && row.market !== filter.market) {
    return false;
  }
  if (filter.underlyingSubType !== undefined) {
    if (row.underlyingSubType === null || !sameSequence(row.underlyingSubType, filter.underlyingSubType)) {
      return false;
    }
  }
  return true;
}

// ── `SymbolSetDivergence` / `compareSymbolSets` — "a divergência é dado, não erro" ─────────

export interface SymbolSetDivergence {
  readonly onlyInFirst: readonly string[];
  readonly onlyInSecond: readonly string[];
}

export function compareSymbolSets(first: ReadonlySet<string>, second: ReadonlySet<string>): SymbolSetDivergence {
  const onlyInFirst = [...first].filter((symbol) => !second.has(symbol)).sort();
  const onlyInSecond = [...second].filter((symbol) => !first.has(symbol)).sort();
  return { onlyInFirst, onlyInSecond };
}

// ── `decideUniverseMembership` — the union of ADMISSIBLE witnesses only ────────────────────

export function decideUniverseMembership(
  witnesses: Partial<Record<DecisiveUniverseSource, ReadonlySet<string>>>,
): ReadonlySet<string> {
  const decided = new Set<string>();
  for (const symbols of Object.values(witnesses)) {
    if (symbols === undefined) {
      continue;
    }
    for (const symbol of symbols) {
      decided.add(symbol);
    }
  }
  return decided;
}

// ── `UniverseAtResult` / `universeAt` ───────────────────────────────────────────────────────

export interface UniverseAtResult {
  readonly ts: string;
  /** ALWAYS the union `decidedSymbols ∪ s3WitnessSymbols` — never one side alone. */
  readonly symbols: ReadonlySet<string>;
  readonly decidedSymbols: ReadonlySet<string>;
  readonly s3WitnessSymbols: ReadonlySet<string>;
  readonly divergence: SymbolSetDivergence;
  /** `null` when a snapshot witness was available; `RETROSPECTIVE_LABEL` when it was not. */
  readonly label: string | null;
}

export interface UniverseAtOptions {
  /**
   * `null`/omitted = "no `exchangeInfo` snapshot exists for `ts`" — distinct from `[]` ("a
   * snapshot exists and its filtered projection is empty"). Only the former yields
   * `RETROSPECTIVE_LABEL`, mirroring `universe_at.py`'s own `None`-vs-`()` distinction.
   */
  readonly snapshotRows?: readonly SnapshotWitnessRow[] | null;
  /** The S3-survivorship-derived witness. NEVER passed to `decideUniverseMembership`. */
  readonly s3WitnessSymbols?: ReadonlySet<string>;
}

export function universeAt(
  ts: string,
  filter: UniverseFilter | null = null,
  options: UniverseAtOptions = {},
): UniverseAtResult {
  const resolvedFilter = filter ?? NO_FILTER;
  const snapshotRows = options.snapshotRows ?? null;
  const s3WitnessSymbols = options.s3WitnessSymbols ?? new Set<string>();

  const witnesses: Partial<Record<DecisiveUniverseSource, ReadonlySet<string>>> = {};
  if (snapshotRows !== null) {
    witnesses[SNAPSHOT] = new Set(
      snapshotRows.filter((row) => filterMatches(resolvedFilter, row)).map((row) => row.symbol),
    );
  }
  const decidedSymbols = decideUniverseMembership(witnesses);
  const symbols = new Set<string>([...decidedSymbols, ...s3WitnessSymbols]);
  return {
    ts,
    symbols,
    decidedSymbols,
    s3WitnessSymbols,
    divergence: compareSymbolSets(decidedSymbols, s3WitnessSymbols),
    label: snapshotRows !== null ? null : RETROSPECTIVE_LABEL,
  };
}

// ── `buildSnapshotWitnessRows` — the join `SnapshotWitnessRow` needs, real-data plumbing ───

export interface RawExchangeInfoEntry {
  readonly symbol: string;
  readonly underlyingSubType?: readonly string[];
  readonly deliveryDate: number;
}

export interface RawExchangeInfoPayload {
  readonly symbols: readonly RawExchangeInfoEntry[];
}

export interface RawFundingInfoEntry {
  readonly symbol: string;
}

/**
 * Join `exchangeInfo` + `fundingInfo` into `SnapshotWitnessRow`s — the same union
 * `build_instrument_rows` computes (`exchangeInfo` ∪ `fundingInfo`), narrowed to the fields
 * `filterMatches`/`universeAt` read. Present in `exchangeInfo` ⇒ `MARKET_USDS_M`; present in
 * `fundingInfo` alone ⇒ `MARKET_COIN_M` (the COIN-M "stowaways", `instrument_universe_
 * snapshot.py`'s own term).
 */
export function buildSnapshotWitnessRows(
  exchangeInfo: RawExchangeInfoPayload,
  fundingInfo: readonly RawFundingInfoEntry[],
): readonly SnapshotWitnessRow[] {
  const exchangeBySymbol = new Map(exchangeInfo.symbols.map((entry) => [entry.symbol, entry]));
  const universe = new Set<string>([...exchangeBySymbol.keys(), ...fundingInfo.map((entry) => entry.symbol)]);
  return [...universe].sort().map((symbol) => {
    const exchangeEntry = exchangeBySymbol.get(symbol);
    return {
      symbol,
      market: exchangeEntry !== undefined ? MARKET_USDS_M : MARKET_COIN_M,
      underlyingSubType: exchangeEntry !== undefined ? (exchangeEntry.underlyingSubType ?? []) : null,
    };
  });
}

// ── The delisting badge — NEW in this task, no Python counterpart ──────────────────────────

/**
 * The sentinel value in `data/snapshots/2026-08-25_exchangeInfo.json` — a `deliveryDate`
 * different from this one is a REAL scheduled delisting, never a value to re-derive by
 * inference. Measured directly on the raw file (all 877 entries, every `contractType`/
 * `status`), not assumed:
 * `[MEDIDO 2026-09-02: python3 -c "import json,collections; d=json.load(open(
 * 'data/snapshots/2026-08-25_exchangeInfo.json')); print(len(d['symbols']),
 * collections.Counter(s['deliveryDate'] for s in d['symbols'])[4133404800000])" →
 * 877 símbolos totais, 743 com o sentinela]`. Restricted to `status=TRADING` +
 * `contractType=PERPETUAL` (`docs/recorte-plataforma.md:90`'s own "568/570" framing —
 * `[MEDIDO 2026-09-02: mesmo comando com filtro adicional 'status'=='TRADING' and
 * 'contractType'=='PERPETUAL' → 570 símbolos, 567 com o sentinela, 3 sem: ICXUSDT, STORJUSDT,
 * SCRTUSDT]`), the task's own anchor case — this module does not apply that restriction (it
 * has no `contractType`/`status` field to filter on; `stampUniverseRows` reads whatever
 * `exchangeInfo` entries the caller passes), it only measures the value the sentinel carries.
 */
export const DELISTING_SENTINEL_DELIVERY_DATE = 4133404800000;

export function hasScheduledDelisting(deliveryDate: number): boolean {
  return deliveryDate !== DELISTING_SENTINEL_DELIVERY_DATE;
}

export function deliveryDateBySymbol(payload: RawExchangeInfoPayload): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const entry of payload.symbols) {
    map.set(entry.symbol, entry.deliveryDate);
  }
  return map;
}

/**
 * One output row of the "S5 embutido" contract: `symbol` + `universeSource` STAMPED (never
 * absent — the task's own title, literal) + the delisting badge. `universeSource` is the FULL
 * set of witnesses that attested the symbol — `["snapshot", "s3_inferred"]` when both did, per
 * the handoff ("cada símbolo devolvido carrega de qual fonte ele veio (snapshot, s3_inferred
 * ou ambos, via divergence)").
 */
export interface UniverseAtRow {
  readonly symbol: string;
  readonly universeSource: readonly UniverseSource[];
  /** `null` when no raw `exchangeInfo` entry exists for this symbol — badge stays honestly `false`. */
  readonly deliveryDate: number | null;
  readonly delistingBadge: boolean;
}

/**
 * Combine a `UniverseAtResult` with a raw `exchangeInfo` capture into per-symbol output rows.
 * `exchangeInfo=null` is the retrospective case (`RETROSPECTIVE_LABEL`, `CA-F0-1`): before
 * `T-02.1`'s first capture there is no raw payload to read a `deliveryDate` from at all, so
 * every row's badge is `false` — a `s3_inferred`-only symbol has never been observed for
 * delisting, and this function does not guess.
 */
export function stampUniverseRows(
  result: UniverseAtResult,
  exchangeInfo: RawExchangeInfoPayload | null,
): readonly UniverseAtRow[] {
  const deliveryDates = exchangeInfo !== null ? deliveryDateBySymbol(exchangeInfo) : new Map<string, number>();
  return [...result.symbols].sort().map((symbol) => {
    const universeSource: UniverseSource[] = [];
    if (result.decidedSymbols.has(symbol)) {
      universeSource.push(SNAPSHOT);
    }
    if (result.s3WitnessSymbols.has(symbol)) {
      universeSource.push(S3_INFERRED);
    }
    const deliveryDate = deliveryDates.get(symbol) ?? null;
    return {
      symbol,
      universeSource,
      deliveryDate,
      delistingBadge: deliveryDate !== null && hasScheduledDelisting(deliveryDate),
    };
  });
}
