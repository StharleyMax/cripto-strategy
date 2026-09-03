"""ZL-1..ZL-3 (`SPEC-001` §5.3): a zero the vendor returns is not a legitimate zero."""

# `SPEC-001` §5.3, transcribed, `CST-4`/`D6.10`: `/liquidation-history?interval=1min` returned
# **361 buckets with `s = 0` literal** where the `daily` aggregate reports real non-zero totals
# (289,65 / 154,53 / 4.547,61 BTC) for the corresponding days. That `0` does not mean "zero
# liquidations in this bucket" — it means "this side of the series had never been observed
# operating yet", and the ingestor has to say so, not paint a flat line at zero.
#
# ── THE THREE RULES, LITERAL ────────────────────────────────────────────────────────────────
#
#   ZL-1  In an EVENT series (e.g. liquidation), `pontos x intervalo` (the retention-window
#         formula, `CA-F3-10`) is PER SIDE (buy/sell), never per whole series. Coinalyze's own
#         wire shape for `/liquidation-history` is `{t, l, s}` (long-liquidated, short-liquidated,
#         `docs/medicao-coinalyze.md` §2.1) — two INDEPENDENT sequences riding the same bucket
#         grid. Summing the two sides before multiplying by the interval answers a question
#         nobody asked: "how many buckets exist", not "how far back does THIS side's data reach".
#
#   ZL-2  The ingestor converts zero-before-the-first-non-zero-OF-THAT-SIDE into
#         `Absence.NO_SOURCE`, never into a legitimate zero. A side that has never once reported
#         a non-zero value has never been "seen operating" — a zero from it is silence, not a
#         measurement of nothing happening.
#
#   ZL-3  A LEGITIMATE zero (once that side has proved it can report a non-zero) is a real
#         observation and must be represented as one — a `Decimal(0)` value, `absence=None` —
#         distinguishable from `NO_SOURCE` by TYPE, not by convention. `ClassifiedSidePoint`
#         below is either a value or a named absence, never both and never neither, the same
#         discipline the read path's own `AsOfReading` type already applies (`T-04.4`).
#
# ── WHY THIS IS `domain` AND NOT A REPLAY OF THE INGESTION PIPELINE ─────────────────────────
#
# `ADR-016` ("Natureza"): the ZERO-vs-`SEM_FONTE` decision is pure logic over a sequence of
# `(event_time, raw_quantity)` pairs already extracted from the wire — it needs no clock, no
# socket, and no store. Fetching `/liquidation-history` for real is `infra`'s job (this module
# never imports `coinalyze_daily_series`'s HTTP-facing pieces); classifying what came back is
# this module's whole job, and it is testable with a list literal.
#
# `data/` is gitignored (`CLAUDE.md`, "Dado bruto nao e versionado") and the 730-day pull that
# produced the 361-bucket, three-BTC-total measurement above is not re-created here — the test
# suite for this module reproduces the SAME PATTERN (leading zeros before a side's first
# non-zero) at a scale a fixture literal can carry, and cites `D6.10`'s numbers as the evidence
# that the pattern is real, not as data this module replays byte-for-byte.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum

from src.modules.sentimento.domain.provenance import Absence


class LiquidationSide(Enum):
    """The two independent sequences ZL-1 says must never be merged before a retention window.

    Member names are English; the VALUES are the Coinalyze wire field letters this module reads
    (`docs/medicao-coinalyze.md` §2.1: `{t, l, s}`). Unlike `Provenance`'s member/value split,
    this is not a contract vocabulary translation — `l`/`s` ARE the field names on the wire, and
    keeping them as the value is what lets a caller round-trip a raw point's key straight into
    this enum without a second lookup table.
    """

    LONG = "l"
    """`l` — long positions liquidated in this bucket."""

    SHORT = "s"
    """`s` — short positions liquidated in this bucket. `D6.10`'s 361 poisoned buckets are `s`."""


class MalformedSidePointError(Exception):
    """`raw_quantity` does not read as a non-negative `Decimal`."""


class NonMonotonicSidePointsError(Exception):
    """Two points of the same side were not given in strictly increasing `event_time` order.

    ZL-2/ZL-3 are decisions about WHICH point is first, second, third for a given side — an
    unordered or duplicated input makes "first non-zero" ambiguous, and guessing an order here
    would silently paper over a caller bug that fed two sides' points into one call, or fed a
    page of results out of sequence.
    """


class InvalidClassifiedSidePointError(Exception):
    """A `ClassifiedSidePoint` was built with an invalid combination of `value`/`absence`.

    Either both were given, or neither, or the absence is not `NO_SOURCE` — the one reason this
    module is contracted to ever produce.
    """


@dataclass(frozen=True)
class SidePoint:
    """One raw point of ONE side's sequence, in time order. `raw_quantity` stays a string.

    Same discipline as `coinalyze_daily_liquidation_quantity` (`liquidation_reconciliation.py`)
    and `cvd.CvdTrade.raw_quantity`: the source's digits are parsed to `Decimal` exactly once,
    at classification time, never re-parsed by a downstream reader.
    """

    event_time: int
    raw_quantity: str


@dataclass(frozen=True)
class ClassifiedSidePoint:
    """ZL-2/ZL-3's verdict for one point: EITHER a value (incl. a legitimate zero) OR `NO_SOURCE`.

    Same shape discipline as the read path's `AsOfReading` (`T-04.4`): a bare zero and an
    absence must never share a representation, so this type refuses to be built with both
    fields set or neither.
    """

    event_time: int
    value: Decimal | None
    absence: Absence | None

    def __post_init__(self) -> None:
        """Refuse a point that is both a value and an absence, or neither, or the wrong absence."""
        if (self.value is None) == (self.absence is None):
            raise InvalidClassifiedSidePointError(
                "a classified side point is EITHER a value or a named absence, never both and "
                "never neither: a bare zero and an absence must not share a representation "
                "(ZL-3, `SPEC-001` §5.3)"
            )
        if self.absence is not None and self.absence is not Absence.NO_SOURCE:
            raise InvalidClassifiedSidePointError(
                f"absence={self.absence!r}: `classify_side_points` only ever produces "
                f"`Absence.NO_SOURCE` (ZL-2) — a different reason belongs to a different "
                f"mechanism, not to this one"
            )
        if self.value is not None and self.value < 0:
            raise InvalidClassifiedSidePointError(
                f"value={self.value!r}: a negative liquidated quantity is not a value this "
                f"side of the series can legitimately report"
            )


def _parse_quantity(point: SidePoint) -> Decimal:
    """Parse `point.raw_quantity`, refusing non-numeric or negative text."""
    try:
        quantity = Decimal(point.raw_quantity)
    except InvalidOperation as failure:
        raise MalformedSidePointError(
            f"event_time={point.event_time}: raw_quantity={point.raw_quantity!r} does not "
            f"read as Decimal"
        ) from failure
    if quantity < 0:
        raise MalformedSidePointError(
            f"event_time={point.event_time}: raw_quantity={point.raw_quantity!r} is negative, "
            f"which is not a value this side of the series can legitimately report"
        )
    return quantity


def classify_side_points(points: Sequence[SidePoint]) -> tuple[ClassifiedSidePoint, ...]:
    """ZL-2/ZL-3: convert zero-before-the-first-non-zero into `NO_SOURCE`; leave later zeros alone.

    `points` MUST already be in strictly increasing `event_time` order FOR THIS SIDE — this
    function never sorts, because sorting would silently accept two sides' points merged into
    one call (ZL-1's exact mistake, one layer down) or a caller's already-broken ordering, and
    turn either into a plausible-looking answer instead of a raised error.

    The rule, applied once per point in order:

    - the FIRST non-zero quantity this side ever reports flips `seen_nonzero` permanently on,
      and that point (and every non-zero point) is a legitimate `ClassifiedSidePoint(value=...)`;
    - a ZERO quantity BEFORE `seen_nonzero` is `NO_SOURCE` (ZL-2) — this side has never been
      observed operating, so a reported zero is silence, not a measurement;
    - a ZERO quantity AFTER `seen_nonzero` is a legitimate `ClassifiedSidePoint(value=Decimal(0))`
      (ZL-3) — this side has proved it can report a non-zero, so a later zero is a real "nothing
      happened in this bucket" and must be carried as a value, never folded into `NO_SOURCE`.
    """
    classified: list[ClassifiedSidePoint] = []
    seen_nonzero = False
    previous_time: int | None = None
    for point in points:
        if previous_time is not None and point.event_time <= previous_time:
            raise NonMonotonicSidePointsError(
                f"event_time {point.event_time} does not strictly follow {previous_time}: "
                f"classify_side_points requires one side's points in increasing event_time "
                f"order, never merged with another side or re-ordered"
            )
        previous_time = point.event_time
        quantity = _parse_quantity(point)
        if quantity != 0:
            seen_nonzero = True
            classified.append(
                ClassifiedSidePoint(event_time=point.event_time, value=quantity, absence=None)
            )
        elif seen_nonzero:
            classified.append(
                ClassifiedSidePoint(event_time=point.event_time, value=Decimal(0), absence=None)
            )
        else:
            classified.append(
                ClassifiedSidePoint(
                    event_time=point.event_time, value=None, absence=Absence.NO_SOURCE
                )
            )
    return tuple(classified)


@dataclass(frozen=True)
class SideRetentionWindow:
    """ZL-1's recomputed `CA-F3-10`: `pontos x intervalo`, for ONE side, never for the series."""

    side: LiquidationSide
    n_points: int
    interval_ms: int
    window_ms: int


def retention_window_per_side(
    side: LiquidationSide,
    classified_points: Sequence[ClassifiedSidePoint],
    *,
    interval_ms: int,
) -> SideRetentionWindow:
    """ZL-1 (`CA-F3-10`): `pontos x intervalo`, counting only THIS side's LEGITIMATE points.

    `classified_points` is `classify_side_points`'s own output, never the raw wire array. This
    matters because counting the raw array would count `NO_SOURCE` buckets (ZL-2) as if they
    were retained observations of THIS side — reintroducing exactly the optimism ZL-2 exists to
    remove: a `NO_SOURCE` bucket exists on the calendar because the OTHER side (or the
    endpoint's own sparse event grid) put a point there, and it says nothing about how far back
    THIS side's own data reaches.

    Calling this once per side, on that side's OWN classified sequence, is what makes "por LADO,
    nao por serie inteira" a property of the call graph and not a comment: there is no function
    in this module that accepts both sides' points together and no way to build one `n_points`
    that mixes them, because a caller would first have to classify each side on its own to get a
    `Sequence[ClassifiedSidePoint]` to pass in at all.
    """
    if interval_ms <= 0:
        raise ValueError(
            f"interval_ms={interval_ms} must be positive to compute a retention window"
        )
    n_points = sum(1 for point in classified_points if point.absence is None)
    return SideRetentionWindow(
        side=side, n_points=n_points, interval_ms=interval_ms, window_ms=n_points * interval_ms
    )


__all__ = (
    "LiquidationSide",
    "MalformedSidePointError",
    "NonMonotonicSidePointsError",
    "InvalidClassifiedSidePointError",
    "SidePoint",
    "ClassifiedSidePoint",
    "classify_side_points",
    "SideRetentionWindow",
    "retention_window_per_side",
)
