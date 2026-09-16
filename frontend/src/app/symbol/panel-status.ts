/**
 * `T-02.4` — the ONE discriminant `page.tsx` computes per panel (price/OI/CVD) and hands to
 * `SymbolClient.tsx` (`"use client"`) by props. Mirrors `console/source-state.ts`'s own
 * reasoning field-for-field: `page.tsx` never throws a `TransportError` past itself, it
 * catches it and turns it into this typed value, which crosses the Server/Client boundary as a
 * plain, serializable object (RSC-safe — no `Error` instance, no function, no `Date`).
 *
 * `"not_in_catalog"` is a FOURTH reason, beyond the three `TransportErrorKind`s the catalog/
 * history transports can throw — it names the (today, real) case where `GET /series-catalog`
 * answered fine but carries no row this panel's selector matches (`page.tsx`'s own docstring:
 * measured true for CVD today, since no catalog builder produces a `cvd_delta`-shaped row).
 *
 * ── `T-03.5`: `"ambiguous_in_catalog"`, THE SIXTH REASON, AND THE ONE THAT COULD NOT BE SAID ──
 *
 * Until it existed, a selector matching MORE than one catalog row had no way to say so:
 * `Array.prototype.find` answered the first of them and the page rendered a panel pointed at a
 * series nobody publishes, with `kind: "ok"` on its status. That is not a hypothetical — it is
 * the measured defect of `handoff/T-03.5-T-03.6-FRONT.md` §2 (`metric === "sum_open_interest"`
 * matches FIVE rows; the first has 0 rows in `md.series`, the fifth has 8.064).
 *
 * ⛔ THE POINT IS NOT THE STRING, IT IS THAT THE STATE BECAME EXPRESSIBLE. A wrong panel that
 * reports success is a defect only a human can find, weeks later, in production (and one did:
 * fase `04` of `pagina-de-grafico-s2`). A panel that says "o catálogo tem N candidatas e eu não
 * escolho por posição" is a defect the SCREEN reports, in the same render.
 */

export type PanelStatus =
  | { readonly kind: "ok" }
  | {
      readonly kind: "absent";
      readonly reason:
        | "not_in_catalog"
        | "ambiguous_in_catalog"
        | "missing_base_url"
        | "connection_refused"
        | "non_2xx"
        | "malformed_envelope";
    };

/**
 * `T-03.5`/`RNF-2` — how old a panel's newest readable point is, against the ceiling the
 * catalog publishes for its series (`SeriesCatalogEntry.maxStalenessMs`).
 *
 * ⛔ IT LIVES IN THIS MODULE, AND NOT IN `view-model.ts` WHERE ITS FUNCTION LIVES, FOR ONE
 * STRUCTURAL REASON: `SymbolClient.tsx` is `"use client"` and must not import `view-model.ts`,
 * which reaches `node:crypto` through `series-key-id.ts` — `web-fullstack.browser-imports-server`
 * is a BLOQUEIO, and a type-only import is not a defence a regex-based rule can be asked to
 * understand. `panel-status.ts` is the dependency-free plain-data contract both halves already
 * import, which makes it the only place the two sides can share a shape without one of them
 * reaching across the RSC boundary. The FUNCTION that computes it stays server-side
 * (`view-model.ts::resolveFreshnessVerdict`); only the SHAPE crosses.
 *
 * `unknown` is not "fresh with a missing number": it is the verdict for two different
 * ignorances — no readable point at all, and no ceiling published — and neither one licenses the
 * screen to claim the data is current.
 *
 * `observedMs` is the `available_at` of the newest READABLE row — a PUBLICATION instant, not a
 * grid instant (`A-4.2`, 2026-09-15). `ageMs` is therefore `referenceMs - observedMs =
 * T - available_at`, the definition `STITCH_CONTEXT.md:1774` writes down. It used to be the last
 * grid instant the server managed to fill, which made the age read `0` for every reading the
 * server still had carry-forward budget for — the ceiling spent twice, once per side.
 *
 * `referenceMs` is the INSTANT `ageMs` is counted back from, carried across the boundary so the
 * renderer can NAME it on screen instead of recomputing `observedMs + ageMs`. It is present on
 * all three kinds — including `unknown`, where the reference is known even though the age is not.
 * `RNF-2` asks the screen to SAY the data is old; an age whose origin is secret cannot be
 * checked by the operator, and a reader who assumes the origin is the wall clock reads the number
 * wrong by 6-10 minutes (`design-review` `A-4.1`).
 */
export type FreshnessVerdict =
  | {
      readonly kind: "fresh";
      readonly ageMs: number;
      readonly observedMs: number;
      readonly referenceMs: number;
      readonly ceilingMs: number;
    }
  | {
      readonly kind: "stale";
      readonly ageMs: number;
      readonly observedMs: number;
      readonly referenceMs: number;
      readonly ceilingMs: number;
    }
  | {
      readonly kind: "unknown";
      readonly ageMs: null;
      readonly observedMs: null;
      readonly referenceMs: number;
      readonly ceilingMs: number | null;
    };

/** `(median, p99, n)` a published fidelity carries — mirrors `series_catalog.py::PublishedError`
 * and `features/s3-inspector/series-catalog.ts::PublishedError`.
 *
 * ⛔ RE-DECLARED HERE RATHER THAN IMPORTED, and for the same structural reason `FreshnessVerdict`
 * lives in this module: `SymbolClient.tsx` is `"use client"` and this shape has to cross the RSC
 * boundary inside `SeriesProvenance`. `series-catalog.ts` itself is plain data and would be safe,
 * but it is reached, in this route, only through modules that are not — and a type-only import is
 * not a defence `web-fullstack.browser-imports-server` (a BLOQUEIO) can be asked to understand.
 * `series-catalog.test.ts`'s own transcription discipline applies: the shape is three numbers and
 * `liquidation-series-selector.test.ts` compares the two declarations. */
export interface PublishedErrorFact {
  readonly medianBp: number;
  readonly p99Bp: number;
  readonly n: number;
}

/**
 * `T-05.9`/`RS-5` — WHOSE MEASUREMENT THE OPERATOR IS LOOKING AT, as a TYPE rather than as a
 * sentence somebody remembered to write.
 *
 * `SPEC-007` §7, literal: *"toda série de terceiro ou de reconstrução que chega à tela é rotulada
 * como tal, com o `published_error` … O operador não pode ler dado de terceiro sem saber que é de
 * terceiro."*
 *
 * ⛔ THE THREE KINDS ARE NOT THREE LABELS — they are what makes the rule impossible to forget.
 * A pane renders the label exactly when `kind === "declared"`, so "third party without a label" is
 * not a state this component tree can express; the alternative (a boolean prop the renderer may
 * simply not read) is how `RS-5` would have been satisfied on paper and violated on screen.
 *
 *   - `unresolved` — no catalog entry resolved, so there is no provenance to declare. NEVER
 *     collapsed into `origin`: "we could not identify the series" and "this is first-party data"
 *     are opposite claims, and only one of them is a reassurance.
 *   - `origin`     — the venue's OWN publisher, and not a reconstruction. No label owed.
 *   - `declared`   — a THIRD PARTY (`provider` is not the venue's origin) and/or a RECONSTRUCTION
 *     (`reconstructedFrom !== null`). The label is owed, and `publishedError` travels with it —
 *     including when it is `null`, which for M4 is a MEASURED REFUSAL and not an oversight
 *     (`liquidation_catalog.py`: Binance has no REST liquidation endpoint, so there is no oracle
 *     to measure a fidelity against, and `ADR-036/D6` escalates the question to the
 *     `quant-architect`). An absent fidelity said out loud beats a fidelity nobody measured.
 */
export type SeriesProvenance =
  | { readonly kind: "unresolved" }
  | { readonly kind: "origin"; readonly provider: string }
  | {
      readonly kind: "declared";
      readonly provider: string;
      readonly reconstructedFrom: string | null;
      readonly publishedError: PublishedErrorFact | null;
    };

/**
 * `T-04.8` — WHAT A WINDOW OF SLOTS ACTUALLY CONTAINS, as five numbers every one of which is
 * derived from values the read API served, and none of which is written by hand.
 *
 * It exists because of `M-1` of `gates/design-04.md` (`ui-designer` + `ux-ui-mastery`, Rev. 3):
 * the approved screen publishes the SCALE of the pane — *"Janela de 4 dias: 1.1395 a 1.8369 ·
 * amplitude 0.6974 (42,08% da mediana 1,6575)"* — and the rodada that tried to publish those
 * numbers without deriving them fabricated SIX of them. Carrying the statistic as a computed
 * TYPE, filled server-side by `view-model.ts::seriesValueStats` from the very slots the chart is
 * drawn from, is what makes a hand-written numeral on this pane inexpressible rather than merely
 * discouraged.
 *
 * ⛔ `median` IS A NEAREST-RANK p50, SO IT IS AN OBSERVED VALUE — never the average of the two
 * middle ones. The interpolated median of an even sample is a number the series never took, and
 * `M-1`'s rule ("todo numeral rastreia a uma medição") is about exactly that difference.
 *
 * ⛔ IT LIVES IN THIS MODULE FOR THE STRUCTURAL REASON `FreshnessVerdict` states above: the SHAPE
 * crosses the RSC boundary into `SymbolClient.tsx` (`"use client"`), the FUNCTION stays in
 * `view-model.ts`, which reaches `node:crypto` and may not be imported by the browser half.
 */
export interface SeriesValueStats {
  /** How many slots of the measured span carried a value — the universe the four numbers below
   * were computed over, published so a reader can tell `n=1` from `n=850`. */
  readonly presentSlots: number;
  readonly min: number;
  readonly max: number;
  /** Nearest-rank p50 — an OBSERVED value of the series, see above. */
  readonly median: number;
  /** `max - min`, kept as the raw IEEE difference. The ROUNDING is presentation and belongs to
   * the renderer (`ratio-format.ts`), which rounds it to the decimal places the operands
   * themselves carry instead of publishing `0.6974000000000001`. */
  readonly amplitude: number;
}

/**
 * `T-01.7` — the statuses `/symbol` computes today, named once so `page.tsx` and
 * `SymbolClient.tsx` cannot drift on the set.
 *
 * `volume` is a FOURTH status for a THIRD chart surface, and that is not a contradiction: it is
 * the sub-axis of the price panel (`SPEC-007 §3.6`), not a panel of its own, but it is fetched
 * from its OWN `series_key_id` (`klines_volume`, `SPEC-007 §4`) and therefore fails and degrades
 * on its own — price can be present while volume is absent, and the operator has to be able to
 * tell which of the two is missing. `PanelStatus`'s existing five reasons cover it unchanged;
 * `not_in_catalog` is the live one until `T-01.6`'s catalog entry reaches the environment being
 * looked at.
 *
 * ⛔ `T-05.9` ADDS TWO MORE, ONE PER LIQUIDATION COHORT, AND THEY ARE DELIBERATELY NOT ONE.
 * `sum_liquidation` is TWO series (`liquidation_catalog.py`: *"a long liquidation is forced
 * selling and a short liquidation is forced buying … their sum moves identically whether the
 * market just flushed longs, flushed shorts, or flushed both"*), fetched under two different
 * `series_key_id`s, so they fail independently — and a single shared status would let a live
 * cohort vouch for a dead one.
 *
 * `T-04.5` adds `longShort` — `count_long_short_ratio` (M3) is a series of its own, fetched under
 * its own `series_key_id`, so it fails and degrades on its own exactly like the six above.
 */
export interface SymbolPanelStatuses {
  readonly price: PanelStatus;
  readonly oi: PanelStatus;
  readonly cvd: PanelStatus;
  readonly volume: PanelStatus;
  readonly liquidationLong: PanelStatus;
  readonly liquidationShort: PanelStatus;
  readonly longShort: PanelStatus;
}
