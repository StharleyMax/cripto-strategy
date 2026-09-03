/**
 * `price_source` declared BY `price_use` — the `charts`-side half of `ADR-007`'s decision
 * table, `PS-1`. Two things this task (`T-05.5`, plan item `5.7`/`D5.5`) need it for:
 *
 *   - the price PANEL declares which `price_source`/`price_use` pair it is showing
 *     (`5.7`, closed by `s2-panels.ts`'s `PricePanel`);
 *   - a MARK made on that panel records the SAME pair on its `<Anotacao>` row, so reopening
 *     under a different price series is never presented as the same mark (`D5.5`, closed by
 *     `s2-annotation-price-binding.ts`).
 *
 * INDEPENDENT TRANSCRIPTION, same move `canonical-grid.ts` makes for the grid (`D5.9`'s own
 * precedent for "two call sites, one law, verified independently"): this is NOT an import of
 * `backend/src/modules/sentimento/domain/price_source_catalog.py` (different language, no
 * cross-language import exists here) and NOT an import of `frontend/src/features/
 * s3-inspector/series-catalog.ts` (`web`; the `D5.12` `charts`<->`web` ESLint boundary
 * forbids it in either direction — see `eslint-boundary.test.ts`).
 *
 * Deliberately kept at the CONCEPT layer `ADR-007`'s own decision table uses (`klines_last` /
 * `mark_price`) — i.e. `price_source_catalog.py`'s `_PRICE_SOURCE_BY_USE_RAW`, BEFORE that
 * module's own substitution of the cataloged metric name `price_mark_close` for the
 * `mark_price` concept. That substitution (looking the row up in `series_catalog`) is
 * `sentimento`'s job; what a human annotating a chart SAW, and what `D5.5`'s own negative
 * test names literally ("marcar sob `price_source = klines_last` e reabrir sob `mark_price`"),
 * is the concept name — `mark_price`, not `price_mark_close`.
 */

/** `ADR-007`'s decision table, `SPEC-001` §3.7's closed set of `price_use` values. */
export type PriceUse =
  | "structure_detection"
  | "liquidation_trigger"
  | "funding"
  | "execution"
  | "cost";

export const PRICE_USES: ReadonlySet<PriceUse> = new Set<PriceUse>([
  "structure_detection",
  "liquidation_trigger",
  "funding",
  "execution",
  "cost",
]);

/** The two price-series CONCEPTS `ADR-007`'s table assigns a `price_use` to, today. */
export type PriceSource = "klines_last" | "mark_price";

/**
 * `ADR-007`'s decision table, transcribed verbatim at the concept layer (pre-substitution):
 *
 * | `price_use`           | `price_source` |
 * |------------------------|----------------|
 * | `structure_detection` | `klines_last`  |
 * | `liquidation_trigger` | `mark_price`   |
 * | `funding`             | `mark_price`   |
 * | `execution`           | `klines_last`  |
 * | `cost`                | `mark_price`   |
 */
const PRICE_SOURCE_BY_USE: Readonly<Record<PriceUse, PriceSource>> = {
  structure_detection: "klines_last",
  liquidation_trigger: "mark_price",
  funding: "mark_price",
  execution: "klines_last",
  cost: "mark_price",
};

/** `price_use` was omitted (`null`) asking for a `price_source` — `ADR-007`/`PS-1`. Its own
 * type, mirroring `price_source_catalog.py::MissingPriceUseError`, so a caller can tell
 * "forgot to ask" apart from "asked for something outside the closed set"
 * (`InvalidPriceUseError`) without inspecting the message. */
export class MissingPriceUseError extends Error {}

/** `price_use` was supplied but is outside `PRICE_USES` — mirrors
 * `series_catalog.py::InvalidPriceUseError`, transcribed here (no cross-language import). */
export class InvalidPriceUseError extends Error {}

/**
 * Returns the `price_source` `ADR-007` assigns to `priceUse` — never a silent default.
 *
 * `PS-1`, literal: "Pedir preço sem `price_use` é erro, nunca default silencioso — um default
 * aqui escolhe qual grandeza o consumidor recebeu, e a escolha muda onde o swing está."
 * `priceUse: PriceUse | null` (not an optional parameter) is the enforcement: a caller must
 * pass something, and passing `null` explicitly is the only way to omit it — there is no
 * signature that lets a caller forget the argument and get a default instead.
 */
export function resolvePriceSource(priceUse: PriceUse | null): PriceSource {
  if (priceUse === null) {
    throw new MissingPriceUseError(
      "price_use is required to resolve a price_source (ADR-007/PS-1): a default here would " +
        "silently pick which price GRANDEZA the consumer receives, and that choice decides " +
        "where the swing is",
    );
  }
  if (!PRICE_USES.has(priceUse)) {
    throw new InvalidPriceUseError(
      `price_use = ${String(priceUse)} is outside ADR-007/SPEC-001 §3.7's closed set ` +
        `${JSON.stringify([...PRICE_USES].sort())}`,
    );
  }
  return PRICE_SOURCE_BY_USE[priceUse];
}
