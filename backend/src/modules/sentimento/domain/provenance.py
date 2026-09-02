"""The seven provenance columns that every series row carries, and what makes a row invalid."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Final

# ── TIME ARRIVES AS A NUMBER, BECAUSE THE LAYER MAY NOT ASK WHAT TIME IT IS ────────────────
#
# `backend/pyproject.toml`, contract "Natureza": `domain` and `use_cases` may not import
# `socket`, `ssl`, `time` or `datetime`. So every one of the five instants below is an
# INJECTED VALUE — epoch milliseconds, UTC — handed in by `infra`, never read here.
#
# The `int` is also what makes the NEXT task work. `T-04.4` reads `argmin(observed_at)` among
# the rows with `available_at <= t` (`SPEC-001` §2.5, plan 04 item 4.5): `int` is totally
# ordered, `min` over it is exact, and there is no parse, no locale and no timezone in the
# path. A string instant would have made `argmin` depend on the spelling being fixed-width —
# a comparison that is right until one source pads differently, and then wrong in silence.

# `SPEC-001` §3.1, transcribed. Order is the projection order, as in `ingest_record.py`.
PROVENANCE_COLUMNS: Final[tuple[str, ...]] = (
    "event_time",
    "available_at",
    "availability_source",
    "ingested_at",
    "observed_at",
    "provenance",
    "src_label_raw",
)

# "+ observer_id · observer_region (ao lado de todo available_at)" — `SPEC-001` §3.1, literal.
# They are listed apart from the seven because the SPEC lists them apart: they qualify ONE of
# the seven rather than standing on their own.
OBSERVER_COLUMNS: Final[tuple[str, ...]] = ("observer_id", "observer_region")

# `SPEC-001` §4.4, `T-04.7` (plan 04 item 4.11): "identidade e dimensao desde a primeira linha
# — nunca constante implicita, nunca NULL (...) principal_id e coluna em toda linha que
# registre ato humano". Listed apart from the seven for the same reason `OBSERVER_COLUMNS` is,
# but the split is sharper: `principal_id` does not qualify one of the seven, it names WHICH
# ROWS the dimension applies to — a `SeriesRow` is a human act exactly when its `provenance` is
# `Provenance.HUMAN` (below), and only then is the column required. `<Anotacao>` and
# `run_registry` carry the same dimension (SPEC-001 §4.4), but they belong to `charts` /
# `backtest` / `web` — out of `sentimento`'s component boundary, so this task does not touch
# them. `ADR-009/D2` refuses `organization_id` as a stand-in or complement for this dimension:
# a single-user system does not get a constant tenant column.
PRINCIPAL_COLUMN: Final[str] = "principal_id"

# `SPEC-001` §2.2: `observer_region` is `[NAO MEDIDO]` and is a column of F0. Until someone
# runs `curl -s ipinfo.io` inside the VPS, the column exists and holds THIS VALUE. It is a
# VALUE AND NOT `NULL`, and the SPEC gives the reason: `NULL` here would push the series
# across the quarantine boundary for the wrong reason.
UNKNOWN_OBSERVER_REGION: Final[str] = "unknown"

# ── `DERIVADO` IS NOT `MODELADO`, AND THIS IS THE ENFORCEMENT ──────────────────────────────
#
# `SPEC-001` §3.1: `price_mark_close = oi_value / oi_base` and `cvd_cum(anchor)` are
# DETERMINISTIC FUNCTIONS OF OBSERVED VALUES. Stamping them `MODELADO` makes the main panel
# born permanently dashed, and a channel that is always on carries no information.
#
# `D4.9` is the measurement that earns `price_mark_close` the word "deterministic", and it was
# REPRODUCED for this task rather than copied `[MEDIDO 2026-08-29, tolerancia ZERO a 8 casas
# decimais, pareando `metrics.create_time` com `markPriceKlines.open_time`:
#   BTCUSDT 2026-08-21  288/288   BTCUSDT 2026-08-23  288/288   (pior residuo 0,0000 bp)
#   COTIUSDT 282/288 (4,3407 bp) · DOGEUSDT 286/288 (1,0847 bp) · SLXUSDT 286/288 (1,9716 bp)
#  n = 5 dias-simbolo, 1.440 buckets pareados; comando em
#  docs/context/plataforma-dados/gates/T-04.2-builder.md]`.
DETERMINISTIC_FUNCTIONS_OF_OBSERVED: Final[frozenset[str]] = frozenset(
    {"price_mark_close", "cvd_cum"}
)


class Provenance(Enum):
    """`provenance` — where the number came from (`SPEC-001` §3.1).

    THE MEMBER NAMES ARE ENGLISH AND THE VALUES ARE THE SPEC'S PORTUGUESE, VERBATIM. The name
    is a production identifier and `CLAUDE.md` line 1 puts those in English; the value is
    contract data that crosses to a consumer, and translating it would rename a column's
    vocabulary without a migration. Keep the mapping visible rather than "fixing" either side.
    """

    OBSERVED = "OBSERVADO"
    """Read from the source as it was published."""

    DERIVED = "DERIVADO"
    """A deterministic function of observed values. NOT `MODELADO` — see the block above."""

    MODELED = "MODELADO"
    """Produced by a model or a calibration, therefore carrying the model's error."""

    HUMAN = "HUMANO"
    """Entered by a person. `SPEC-001` §4.4 requires `principal_id` alongside, and `SeriesRow`
    below enforces it: a `HUMANO` row with a blank or absent `principal_id` is refused rather
    than stored with the dimension silently missing (`T-04.7`, plan 04 item 4.11)."""


class Absence(Enum):
    """`Ausencia` — the four ways a point can fail to be there (`SPEC-001` §3.1).

    Defined here, with the provenance vocabulary, because absence is the other half of the
    same question: a reader gets a value with a provenance, or it gets an absence with a
    reason. THE CONSUMER IS THE READ PATH (`T-04.4`, plan 04 item 4.5) — this task declares
    the closed set so that path cannot invent a fifth reason or return a bare `None`.
    """

    NO_POINT = "SEM_PONTO"
    """The grid has a bucket and the source published nothing in it."""

    NOT_READ = "NAO_LIDO"
    """Nobody asked the source for this window yet. Not the same as the source having none."""

    QUARANTINE = "QUARENTENA"
    """The point exists and failed the three-term predicate of `SPEC-001` §5.2."""

    NO_SOURCE = "SEM_FONTE"
    """No source can ever supply it. `QF-4`: a read under `quantity_field = nq` before the
    first live capture returns THIS — it never falls back to `q`, and never welds."""


class AvailabilitySource(Enum):
    """`availability_source` — whether `available_at` was seen or calibrated (`SPEC-001` §2.2).

    CAREFUL: `AvailabilitySource.OBSERVED` and `Provenance.OBSERVED` share a member name and
    do NOT share a value (`"OBSERVED"` against `"OBSERVADO"`), because they answer different
    questions — one is about the timestamp, the other about the number. They are not
    interchangeable and `test_provenance_columns.py` pins that they never become so.
    """

    OBSERVED = "OBSERVED"
    """A live consumer was watching, and this is when the point actually showed up."""

    MODELED = "MODELED"
    """Stamped from the lag table keyed by `(endpoint, observer_region)`. That table, with its
    `lag_stat`/`lag_n`/`lag_resolution_s`/`lag_window` columns, is `SPEC-001` §2.2 and belongs
    to the ingestion path, not to this row. A badly calibrated MODELED stamp is OPTIMISTIC in
    silence, which is the exact direction the contract forbids."""


class InvalidSeriesRowError(Exception):
    """A row that `SPEC-001` §3.2 declares invalid — it fails instead of being stored."""


@dataclass(frozen=True)
class SeriesRow:
    """One row of a market series: the identity, the bucket, and the seven provenance columns.

    KEY (`SPEC-001` §3.2): `(series_key_id, symbol, source, bucket_end, observed_at)`, and the
    table is APPEND-ONLY. `observed_at` being IN the key is why the same bucket can be
    present twice with two observation instants — which is precisely the situation `T-04.4`
    resolves with `argmin(observed_at)` (`D4.13`: `as_of` returns the FIRST observation, never
    the last). A row shape without `observed_at` in the key would have made that unanswerable.

    `is_final` and `principal_id` are the two OPTIONAL COLUMNS, and `None` means something
    different for each. For `is_final`, `None` means "the source does not declare finality" —
    `SPEC-001` §3.1 lists it as "quando a fonte o declara". That is a different thing from a
    missing required column, and mixing the two would let a source that DOES declare finality
    be stored as though it did not. For `principal_id`, `None` means "this row is not a human
    act" — it is REQUIRED, not optional, the moment `provenance` is `Provenance.HUMAN`
    (`SPEC-001` §4.4, `T-04.7`), and `__post_init__` below refuses a `HUMANO` row that omits it
    or leaves it blank. Nothing in this module ever supplies a default for it: the one caller
    that builds a `HUMANO` row is the one that must say who acted.
    """

    series_key_id: str
    symbol: str
    source: str
    bucket_end: int
    event_time: int
    available_at: int
    availability_source: AvailabilitySource
    ingested_at: int
    observed_at: int
    provenance: Provenance
    src_label_raw: str
    observer_id: str
    observer_region: str
    is_final: bool | None
    principal_id: str | None = None

    def __post_init__(self) -> None:
        """Refuse a row with a blank required text column, per `SPEC-001` §3.2 and §4.4.

        The clock-skew check is NOT here: it needs `clock_skew_tolerance_ms`, which is a
        per-series configured value and not a column of the row. `build_series_row` below is
        the entry point that applies both.
        """
        for column in ("series_key_id", "symbol", "source", "src_label_raw", "observer_id"):
            if not getattr(self, column).strip():
                raise InvalidSeriesRowError(
                    f"column '{column}' is blank: `SPEC-001` §3.2 makes a row invalid when any "
                    f"of the provenance columns is missing, and blank is missing"
                )
        if not self.observer_region.strip():
            raise InvalidSeriesRowError(
                "column 'observer_region' is blank: `SPEC-001` §2.2 says the value is "
                f"'{UNKNOWN_OBSERVER_REGION}' until it is measured — a VALUE, never absent"
            )
        if self.provenance is Provenance.HUMAN and not (self.principal_id or "").strip():
            raise InvalidSeriesRowError(
                "column 'principal_id' is blank on a HUMANO row: `SPEC-001` §4.4 makes "
                "identity a dimension of every human-act row — never `NULL`, never an "
                "implicit constant supplied by infra (`T-04.7`, plan 04 item 4.11)"
            )

    def provenance_projection(self) -> dict[str, object]:
        """Project the seven provenance columns, the observer pair, `is_final` and `principal_id`.

        Enums project as their VALUE so the projection is what a consumer reads off the wire.
        `principal_id` projects as `None` for a row that is not a human act — the column
        exists on every projection, the same way `is_final` does, and a consumer that only
        cares about `HUMANO` rows reads it there rather than through a second code path.
        """
        projected: dict[str, object] = {}
        for column in (*PROVENANCE_COLUMNS, *OBSERVER_COLUMNS, "is_final", PRINCIPAL_COLUMN):
            value = getattr(self, column)
            projected[column] = value.value if isinstance(value, Enum) else value
        return projected


def reject_modeled_for_deterministic_metric(metric: str, provenance: Provenance) -> None:
    """Refuse `MODELADO` on a metric that is a deterministic function of observed values.

    `SPEC-001` §3.1 names two of them and gives the consequence rather than a preference: a
    dashed channel that is always dashed carries no information. `D4.9` is the measurement
    that puts `price_mark_close` in the set — reconciliation at ZERO tolerance, 8 decimals.
    """
    if metric in DETERMINISTIC_FUNCTIONS_OF_OBSERVED and provenance is Provenance.MODELED:
        raise InvalidSeriesRowError(
            f"metric '{metric}' is a deterministic function of observed values, so its "
            f"provenance is '{Provenance.DERIVED.value}' and never "
            f"'{Provenance.MODELED.value}' (`SPEC-001` §3.1; `D4.9` measured it)"
        )


def modeled_write_overwrites_observed(
    provenance: Provenance, *, observed_already_present: bool
) -> bool:
    """`D7.16`: True exactly when a MODELED candidate would land on a bucket OBSERVED already owns.

    `ADR-002/D5`: `CA-F3-12` forbids `ReplacingMergeTree(ingested_at)` or any equivalent that lets
    a MODELED backfill overwrite a captured OBSERVADA point — doing so destroys the real
    `available_at` and erases the live `nq` variant, ALWAYS in the optimistic direction (the
    engine keeps the tidy backfill and drops the messy real capture that arrived first). The fix
    is this predicate, evaluated by the single writer BEFORE the row reaches any of the five
    `ADR-002` storage candidates — the invariant is the application's, not the engine's.

    Only `Provenance.MODELED` is ever blocked. `OBSERVED`, `DERIVED` and `HUMAN` candidates
    always return `False` here: `D7.16` names one direction only ("modelado nunca vence
    observado"), and `OBSERVED` landing on a bucket that already has an `OBSERVED` row (a source
    correction, or a second source for the same bucket) is a normal append — `SeriesRow`'s key
    includes `observed_at`, so two OBSERVED rows for the same bucket coexist by design and are
    not this function's concern.

    `observed_already_present` is the caller's answer to "does an OBSERVED row already exist for
    THIS row's `(series_key_id, symbol, source, bucket_end)`?" — a question that needs a read
    against whatever store `ADR-002/D4` eventually names, which is exactly why this function
    takes the answer as a plain `bool` instead of performing the read itself: `domain` may not
    talk to a store (`Natureza`, top of this file), and the answer is the same shape regardless
    of which of the five candidates supplies it.

    A MODELED row where `observed_already_present` is `False` — a gap with nothing in it yet —
    returns `False`: "modelado pode preencher um gap onde não havia nada" is the other half of
    `D7.16`, and refusing that case too would turn a legitimate backfill into a permanent hole.
    """
    return provenance is Provenance.MODELED and observed_already_present


def reject_clock_skew(row: SeriesRow, *, clock_skew_tolerance_ms: int) -> None:
    """Refuse a row whose `available_at` precedes `event_time` beyond the declared tolerance.

    `SPEC-001` §3.2 makes this an invalidity of the ROW, not a warning. `available_at` earlier
    than `event_time` means a consumer could have known the fact before the fact happened —
    lookahead written into the store — and the only reason to tolerate any of it is host
    clock skew, which is why the tolerance is a declared number and never a default.
    """
    if clock_skew_tolerance_ms < 0:
        raise InvalidSeriesRowError(
            f"clock_skew_tolerance_ms = {clock_skew_tolerance_ms} is negative: a negative "
            f"tolerance would REQUIRE lookahead instead of tolerating skew"
        )
    skew_ms = row.event_time - row.available_at
    if skew_ms > clock_skew_tolerance_ms:
        raise InvalidSeriesRowError(
            f"available_at precedes event_time by {skew_ms} ms, over the declared tolerance "
            f"of {clock_skew_tolerance_ms} ms (`SPEC-001` §3.2)"
        )


def build_series_row(row: SeriesRow, *, metric: str, clock_skew_tolerance_ms: int) -> SeriesRow:
    """Return the row after every check `SPEC-001` §3.2 makes a condition of storing it.

    ONE ENTRY POINT ON PURPOSE. The two checks it adds to `__post_init__` each need a value
    the row does not carry — the metric name lives in the `SeriesKey`, the tolerance is
    configured per series — and leaving them as two separate calls at the write site is how a
    caller ends up doing one of them.
    """
    reject_modeled_for_deterministic_metric(metric, row.provenance)
    reject_clock_skew(row, clock_skew_tolerance_ms=clock_skew_tolerance_ms)
    return row
