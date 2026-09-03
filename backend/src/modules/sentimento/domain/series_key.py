"""The 15-term series identity: what makes two series the SAME series, and what makes them two."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, fields
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.canonical_json import canonical_json

# ── WHY IDENTITY AND NOT COLUMNS, IN ONE PARAGRAPH ────────────────────────────────────────
#
# `SPEC-001` §2.1 writes the key with FIFTEEN terms, and the SPEC's own §1 is the record of
# what a shorter key already cost: with `quantity_field` OUTSIDE the key, one identity would
# carry a `q` history (the S3 dump never publishes `nq`) welded to an `nq` live tail, and the
# deficit between them is UNIDIRECTIONAL — `nq > q` happened 0 of 1000 times — so a running
# `cvd_cum` drifts without bound inside the anchor window. Measured at the joint on DOGEUSDT:
# `cvd_delta(q) = 4.044.402` against `cvd_delta(nq) = 3.801.205`, a gap of `243.197`, which is
# **6,01%** of `|cvd_delta(q)|` `[DOC: SPEC-001 §1.1, ADR-001]`.
#
# That is the SPEC's global falsifier `F-2` stated forwards: two series sharing a `SeriesKey`
# whose `cvd_cum` diverge means the key is INCOMPLETE. `tests/sentimento/
# test_series_identity.py` runs it as an executable check over those two numbers instead of
# trusting this comment.
#
# The same argument, second instance: `CA-F2-17`. Coinalyze publishes OHLC over the bucket, so
# "the Coinalyze OI" is FOUR series (`OPEN`/`HIGH`/`LOW`/`CLOSE`) and the Binance one is ONE
# (`POINT`). Without `reduction` in the key those five collapse into two identities and the
# reader gets whichever row was written last.

# ── THE ORDER IS PART OF THE CONTRACT ─────────────────────────────────────────────────────
#
# Transcribed from `SPEC-001` §2.1 in the order the SPEC writes them. The order feeds the
# `sha256` of the canonical projection below, so reordering this tuple re-identifies every
# series in the store: a migration, not a style change. `series_catalog` (`SPEC-001` §3.3)
# stores one row per key with exactly these fields.
SERIES_KEY_TERMS: Final[tuple[str, ...]] = (
    "provider",
    "venue",
    "instrument_id",
    "metric",
    "cohort",
    "interval",
    "unit",
    "denom",
    "nature",
    "ts_convention",
    "reduction",
    "quantity_field",
    "label_shift",
    "aggregation_scope",
    "verified_by",
)

# `SPEC-001` §3.1, literal: "`implied_avg_price` esta PROIBIDO como nome. E `price_mark_close`".
# `SPEC-001` §3.1/§5.11, `CA-F2-3` (`plan 06` items 6.3+6.10, `T-06.3`): "`ls_ratio` generico e
# PROIBIDO" — the four Long/Short series (`count_long_short_ratio`,
# `count_toptrader_long_short_ratio`, `sum_toptrader_long_short_ratio`,
# `sum_taker_long_short_vol_ratio`) have autocorrelation lag-1 of 0,99+ for three of them and
# 0,0955 for the fourth `[MEDIDO]` — a generic name would collapse four series that do not even
# share a nature-of-ratio into one guarda-chuva column, which is the exact failure `F-2` names.
#
# Both bans live here, in the identity, and not in a linter: a forbidden metric name that only a
# regex refuses can still be written by anything that does not go through the regex, and the
# name is one of the fifteen terms that decide what the series IS.
FORBIDDEN_METRIC_NAMES: Final[frozenset[str]] = frozenset({"implied_avg_price", "ls_ratio"})

# One reason per forbidden name — `__post_init__` cites it verbatim, so a second entry in
# `FORBIDDEN_METRIC_NAMES` can never inherit `implied_avg_price`'s own reason by accident (the
# defect this dict prevents: a hardcoded message that was true for one name and false for two).
_FORBIDDEN_METRIC_REASONS: Final[dict[str, str]] = {
    "implied_avg_price": (
        "SPEC-001 §3.1: the name is 'price_mark_close', and it is one of the four price series"
    ),
    "ls_ratio": (
        "SPEC-001 §3.1/§5.11, CA-F2-3: it is a generic name standing in for FOUR series with "
        "different autocorrelation (0,99+ for three of them, 0,0955 for the fourth) — use "
        "'count_long_short_ratio', 'count_toptrader_long_short_ratio', "
        "'sum_toptrader_long_short_ratio' or 'sum_taker_long_short_vol_ratio'"
    ),
}


class Nature(Enum):
    """`nature` — what kind of quantity the series carries (`SPEC-001` §2.1)."""

    STOCK = "STOCK"
    """A level that exists at an instant: open interest is the case that matters here."""

    FLOW = "FLOW"
    """A quantity accumulated OVER the bucket. `LOCF` over it is a type error, never UX."""

    RATIO = "RATIO"
    """A dimensionless quotient — the four long/short series, each with its own columns."""

    EVENT = "EVENT"
    """A discrete occurrence with no value between occurrences."""

    TICK = "TICK"
    """One observation per trade, ungridded."""


class TsConvention(Enum):
    """`ts_convention` — what the timestamp of a row MEANS (`SPEC-001` §2.1)."""

    POINT_AT_BUCKET_END = "POINT_AT_BUCKET_END"
    """One reading, stamped at the close of the window. Binance `sumOpenInterest`."""

    AGGREGATE_OVER_BUCKET = "AGGREGATE_OVER_BUCKET"
    """A quantity summed across the window — the shape every `FLOW` series takes."""

    OHLC_OVER_BUCKET = "OHLC_OVER_BUCKET"
    """Four readings of the same window. It is what makes Coinalyze OI four series."""


class Reduction(Enum):
    """`reduction` — WHICH reading of the bucket this series publishes (`CA-F2-17`).

    Asking for "the Coinalyze OI" without this term is an ERROR and never a default: the four
    members `OPEN`/`HIGH`/`LOW`/`CLOSE` of an `OHLC_OVER_BUCKET` source are four different
    series, and `SPEC-001` §2.1 records the measurement that settles it — the Coinalyze `c`
    matches `sumOpenInterest` of the same `create_time` to 1,86 bp median / 9,46 bp p99
    (n=1.706), while `o(t)` equals `c(t-300)` in only 6 of 2.141 pairs.
    """

    POINT = "POINT"
    OPEN = "OPEN"
    HIGH = "HIGH"
    LOW = "LOW"
    CLOSE = "CLOSE"
    SUM = "SUM"
    MEAN = "MEAN"
    LAST = "LAST"


class QuantityField(Enum):
    """`quantity_field` — which `aggTrade` quantity the series is built from (`ADR-001`).

    THE MEMBER NAMES ARE ENGLISH AND THE VALUES ARE THE SOURCE'S OWN SPELLING. `q` and `nq`
    are Binance payload field names (`ADR-001`, measured: the REST `aggTrades` object has
    eight keys, `['T','a','f','l','m','nq','p','q']`), so translating the VALUE would rename a
    third party's field.
    """

    Q = "q"
    """Total quantity. Canonical on the DECISION path (`QF-2`) — the only one the S3 dump
    publishes, therefore the only one that exists at full depth."""

    NQ = "nq"
    """Quantity excluding RPI orders. Capture-or-lose (`CL-5`): the dump never has it and the
    REST window is 48 h, so every uncaptured day is a day without `nq`, forever."""

    NA = "NA"
    """The series does not derive from `aggTrade`. AN EXPLICIT VALUE, NEVER `NULL` — `NULL` in
    a term of identity produces two rows that neither distinguish nor compare (`SPEC-001`
    §2.1), which is the exact failure this whole module exists to prevent."""


class IncompleteSeriesKeyError(Exception):
    """A term of the identity that is missing, blank, or a name the SPEC forbids.

    It is one exception for the whole key on purpose: every one of the fifteen terms fails the
    same way — the series cannot be told apart from another — and a caller that wants to know
    WHICH term reads the message, which always names it.
    """


@dataclass(frozen=True)
class SeriesKey:
    """The complete identity of one series — the fifteen terms of `SPEC-001` §2.1.

    NO FIELD HAS A DEFAULT, AND THAT IS THE ENFORCEMENT OF `CA-F2-17`. A default on
    `reduction` would let "the Coinalyze OI" resolve to one of four series silently; a default
    on `quantity_field` would re-open the `q`/`nq` weld that `ADR-001` closed. The absence is
    load-bearing and `test_series_identity.py` pins it by introspecting `dataclasses.fields`,
    so adding one later fails a test instead of passing review.

    `label_shift` is IN MILLISECONDS and the term keeps the SPEC's name rather than gaining a
    `_ms` suffix: `series_catalog` (`SPEC-001` §3.3) stores "os 15 termos da chave" under
    these names, and a suffix here would rename a catalog column.
    """

    provider: str
    venue: str
    instrument_id: str
    metric: str
    cohort: str
    interval: str
    unit: str
    denom: str
    nature: Nature
    ts_convention: TsConvention
    reduction: Reduction
    quantity_field: QuantityField
    label_shift: int
    aggregation_scope: str
    verified_by: str

    def __post_init__(self) -> None:
        """Refuse a key with a blank textual term or a metric name the SPEC forbids."""
        for term in SERIES_KEY_TERMS:
            value = getattr(self, term)
            if isinstance(value, str) and not value.strip():
                raise IncompleteSeriesKeyError(
                    f"term '{term}' is blank: a blank term of identity does not distinguish "
                    f"two series, which is the failure `SPEC-001` F-2 names"
                )
        if self.metric in FORBIDDEN_METRIC_NAMES:
            raise IncompleteSeriesKeyError(
                f"metric '{self.metric}' is forbidden by {_FORBIDDEN_METRIC_REASONS[self.metric]}"
            )

    def canonical_terms(self) -> dict[str, object]:
        """Project the key onto the fifteen terms, in the order `SPEC-001` §2.1 writes them.

        Enum members are projected as their VALUE, so the projection is what a catalog row and
        a wire payload carry and not a Python repr that would change with a rename.
        """
        projected: dict[str, object] = {}
        for term in SERIES_KEY_TERMS:
            value = getattr(self, term)
            projected[term] = value.value if isinstance(value, Enum) else value
        return projected

    def series_key_id(self) -> str:
        """Return `sha256` of the canonical projection — the `series_key_id` of `SPEC-001` §3.2.

        TWO KEYS THAT DIFFER IN ANY ONE TERM GET DIFFERENT IDs, INCLUDING `verified_by`. That
        last one follows §2.1 to the letter, and it is worth saying out loud: renaming the
        test that verified `label_shift` re-identifies the series. See the note in
        `test_series_identity.py::test_verified_by_is_inside_the_identity_and_that_is_a_cost`.
        """
        return hashlib.sha256(_canonical_json(self.canonical_terms()).encode("utf-8")).hexdigest()


def series_key_field_names() -> tuple[str, ...]:
    """Return the dataclass field names, so a test can compare them against the SPEC's order.

    This exists so the transcription in `SERIES_KEY_TERMS` and the dataclass cannot drift
    apart in silence: they are two hand-written lists of the same contract, and the test
    compares them pairwise.
    """
    return tuple(field.name for field in fields(SeriesKey))


def _canonical_json(payload: dict[str, object]) -> str:
    """Delegate to the ONE shared serializer (`canonical_json.py`, unified by `T-04.6`).

    Kept as a thin private wrapper — not a bare re-import — so `test_series_identity.py`'s
    `from ...series_key import _canonical_json` keeps resolving under `mypy --strict`'s
    `no_implicit_reexport`: a plain `import canonical_json as _canonical_json` is an import,
    which that rule refuses to treat as an export of this module; a local `def` is not.
    """
    return canonical_json(payload)
