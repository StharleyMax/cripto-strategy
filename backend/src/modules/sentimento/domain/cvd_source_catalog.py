"""`cvd_source` catalog rows, with the published error `SPEC-001` §3.3 gates registration on."""

# Plan `06` item 6.9, `CA-F2-16`, `ADR-001`/5. `T-06.1` (`series_catalog.py`) already built and
# tested the refusal this task relies on: `SeriesCatalogEntry.__post_init__` raises
# `InvalidCatalogEntryError` for a row that declares `reconstructed_from` without a
# `published_error` — using its own fixture numbers for exactly the `coinalyze_bv` row this
# module now populates for real (`test_series_catalog.py::
# test_a_reconstruction_with_its_published_error_builds`). This module does not reimplement
# that check; it calls the real constructor and lets it fail the way `D6.9` requires.
#
# ── WHY `aggtrade_q`/`aggtrade_nq` ARE NOT RECONSTRUCTIONS HERE, AND `coinalyze_bv` IS ──────
#
# `ADR-001`/D2 fixes `quantity_field = q` as "o valor canônico do caminho de decisão" and `nq`
# as "série paralela" — both are DIRECT reads of the `aggTrade` stream (`ADR-001`, `SPEC-001`
# §1), distinguished by the identity term `SeriesKey.quantity_field` that already exists for
# exactly this reason (`T-04.2`). Neither is a reconstruction of the other, so neither carries
# `reconstructed_from`/`published_error` — a row is a "reconstruction" only when it is a
# DIFFERENT source's approximation of the real CVD (`series_catalog.py`'s own words), and a
# direct trade read is not an approximation of itself.
#
# `coinalyze_bv` IS a reconstruction: it derives `cvd`-shaped signal from Coinalyze's
# aggregated `bv` (buy-volume) field, an endpoint that never sees individual `aggTrade`s
# (`quantity_field = NA`), and its accuracy against the `aggtrade_q` ground truth is exactly
# what `CA-F2-16` measured:
#
#     median_bp = 0,0000 · p99_bp = 29,34 · max_bp = 1.955,80 · n = 699
#     measured_on = 2026-08-24
#
# `causa_da_cauda = NÃO DIAGNOSTICADA` — the hypothesis that the "maker" side of the trade
# explains the tail was tested and REFUTED at 2.584,87 bp, which is why `tail_cause` below is
# `TailCause.NOT_DIAGNOSED` and not `MAKER_SIDE` or any other name: `CLAUDE.md`'s discipline is
# explicit that a refuted hypothesis is not restated as the answer.
#
# ── `QF-5`'S OWN (mediana, p99, máx, n, data) FOR `aggtrade_q`/`aggtrade_nq`: `[NÃO MEDIDO]` ─
#
# `SPEC-001` §1.2 (`QF-5`) asks that `aggtrade_q` AND `aggtrade_nq` each publish
# `(mediana, p99, máx, n, data_da_medição)`. `ADR-001` itself only measures point figures for
# ONE symbol pair (DOGEUSDT: `q ≠ nq` déficit **80,56 bp**, `cvd_delta` gap **6,01%**) — not an
# aggregate median/p99/n triple across symbols, and not for `aggtrade_q` in isolation (it is
# the reference, not a thing measured against itself). Synthesizing a `(median, p99, n)` from
# those two point figures would be a number without the command that produced it — exactly
# what `CLAUDE.md` forbids — so this module registers both as catalog rows (closing "fontes a
# registrar: aggtrade_q, aggtrade_nq" for item 6.9) WITHOUT a fabricated `published_error`,
# and leaves `QF-5`'s aggregate figure `[NÃO MEDIDO]`, dono a task futura ou
# `/quant-architect` — the same posture `instrument_alias.py` takes for `Q12`'s content.
#
# ── DOMAIN, NOT infra (`ADR-016`, `Natureza`) ───────────────────────────────────────────────
#
# `date` is a VALUE type (`measured_on`), never `.today()`. No file, no socket.

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.series_catalog import PublishedError, SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# `SPEC-001` §3.7, transcribed verbatim: the closed set `cvd_source` ranges over.
CVD_SOURCES: Final[frozenset[str]] = frozenset(
    {
        "aggtrade_q",
        "aggtrade_nq",
        "kline_takerbuy",
        "rest_taker_vol",
        "metrics_ratio",
        "coinalyze_bv",
    }
)

# The subset THIS task registers (`T-06.9`, plan 06 item 6.9). The other three
# (`kline_takerbuy`, `rest_taker_vol`, `metrics_ratio`) have no measured `published_error` in
# this repository yet — `[NÃO MEDIDO]`, a future task's rows, not this one's to fabricate.
REGISTERED_CVD_SOURCES: Final[frozenset[str]] = frozenset(
    {"aggtrade_q", "aggtrade_nq", "coinalyze_bv"}
)

# The metric name `T-06.1` already fixed in its own fixtures for a `cvd_source` catalog row
# (`test_series_catalog.py`'s `metric="cvd_source"`) — kept identical here so this module's
# rows are the SAME contract the merged test already exercises, not a second name for it.
CVD_SOURCE_METRIC: Final[str] = "cvd_source"


class TailCause(Enum):
    """`causa_da_cauda` — why a reconstruction's worst errors happen, when it is known.

    A CLOSED set with exactly one member today: a refuted hypothesis is not a cause, so
    "maker-side trades explain the tail" (refuted at 2.584,87 bp for `coinalyze_bv`, see
    `RefutedTailHypothesis` below) does not get a member here. The set grows the day a cause is
    actually diagnosed and measured — not before.
    """

    NOT_DIAGNOSED = "NAO_DIAGNOSTICADA"


class InvalidCvdSourceMeasurementError(Exception):
    """A `CvdSourceMeasurement`/`RefutedTailHypothesis` field fails its own invariant."""


@dataclass(frozen=True)
class RefutedTailHypothesis:
    """One candidate explanation for a reconstruction's tail, and the bp at which it failed.

    Recorded so the NEXT reader does not re-propose "maker" for `coinalyze_bv`'s tail without
    first seeing that it was already tested and refuted — `CLAUDE.md`'s own example of a defect
    this discipline caught (an anti-lookahead rule that was inverted and silently propagated by
    two documents).
    """

    description: str
    refuted_at_bp: Decimal

    def __post_init__(self) -> None:
        """Refuse a hypothesis with no description or a non-positive refutation threshold."""
        if not self.description.strip():
            raise InvalidCvdSourceMeasurementError(
                "RefutedTailHypothesis.description is blank: a refuted hypothesis with no "
                "description cannot be told apart from another on read"
            )
        if self.refuted_at_bp <= 0:
            raise InvalidCvdSourceMeasurementError(
                f"RefutedTailHypothesis.refuted_at_bp = {self.refuted_at_bp!r} must be "
                f"positive: a magnitude of bp at which a hypothesis failed cannot be zero or "
                f"negative"
            )


@dataclass(frozen=True)
class CvdSourceMeasurement:
    """`PublishedError` (`SPEC-001` §3.3's own three gating fields) plus `CA-F2-16`'s extras.

    `series_catalog.py`'s own docstring names exactly this split: a source that wants to
    publish `máx` or a measurement date "carries those on top, in the module that populates
    it" — this task, this type — rather than as a change to the merged `PublishedError`
    contract. `published_error` is what a `SeriesCatalogEntry` is built with; the rest is
    carried alongside for a reader who wants the full measurement `CA-F2-16` records.
    """

    published_error: PublishedError
    max_bp: Decimal
    measured_on: date
    tail_cause: TailCause
    refuted_hypotheses: tuple[RefutedTailHypothesis, ...] = ()

    def __post_init__(self) -> None:
        """Refuse a `max_bp` that could not be the maximum of a non-negative distribution."""
        if self.max_bp < self.published_error.p99_bp:
            raise InvalidCvdSourceMeasurementError(
                f"max_bp = {self.max_bp!r} is less than published_error.p99_bp = "
                f"{self.published_error.p99_bp!r}: the maximum of a distribution cannot be "
                f"below its own 99th percentile"
            )


# `CA-F2-16`, `[MEDIDO 2026-08-24]`: `coinalyze_bv` against the `aggtrade_q` ground truth,
# n=699. The "maker" hypothesis for the tail was tested and refuted at 2.584,87 bp — recorded,
# not asserted as the cause (`TailCause.NOT_DIAGNOSED` above).
COINALYZE_BV_MEASUREMENT: Final[CvdSourceMeasurement] = CvdSourceMeasurement(
    published_error=PublishedError(median_bp=Decimal("0.0000"), p99_bp=Decimal("29.34"), n=699),
    max_bp=Decimal("1955.80"),
    measured_on=date(2026, 8, 24),
    tail_cause=TailCause.NOT_DIAGNOSED,
    refuted_hypotheses=(
        RefutedTailHypothesis(
            description="maker-side trades explain the tail of coinalyze_bv vs aggtrade_q",
            refuted_at_bp=Decimal("2584.87"),
        ),
    ),
)


def build_aggtrade_q_entry(
    instrument_id: str, *, unit: str, verified_by: str
) -> SeriesCatalogEntry:
    """Build the `aggtrade_q` `cvd_source` row: the canonical, DIRECTLY-READ trade stream.

    `quantity_field = Q` is the identity term that distinguishes this row from `aggtrade_nq`
    (`ADR-001`/D1) — not `reconstructed_from`, which stays `None`: `q` is the reference
    `ADR-001`/D2 names as canonical, not an approximation of anything.

    `unit` is REQUIRED, never defaulted to `"BTC"`: the summed quantity is in the instrument's
    BASE asset (`ETH` for `ETHUSDT`, not `BTC`), and a hardcoded default here would silently
    mislabel every non-`BTC` instrument this function is called for.
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=CVD_SOURCE_METRIC,
        cohort="all",
        interval="1m",
        unit=unit,
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.Q,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(key=key, native_grid="1min", max_staleness_ms=120_000)


def build_aggtrade_nq_entry(
    instrument_id: str, *, unit: str, verified_by: str
) -> SeriesCatalogEntry:
    """Build the `aggtrade_nq` `cvd_source` row: the RPI-excluded, DIRECTLY-READ trade stream.

    `quantity_field = NQ`, same reasoning as `build_aggtrade_q_entry`: a parallel direct read,
    not a reconstruction of `q` (`ADR-001`/D3) — `CL-5`, capture-or-lose, valid only for
    `t >= primeira_captura_ao_vivo`, is the read-path's concern (`T-04.4`), not this catalog
    row's. `unit` is required for the same reason as `build_aggtrade_q_entry`'s.
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=CVD_SOURCE_METRIC,
        cohort="all",
        interval="1m",
        unit=unit,
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.NQ,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(key=key, native_grid="1min", max_staleness_ms=120_000)


def build_coinalyze_bv_entry(
    instrument_id: str, *, unit: str, verified_by: str
) -> SeriesCatalogEntry:
    """Build the `coinalyze_bv` `cvd_source` row: a RECONSTRUCTION, gated on its published error.

    `reconstructed_from="aggtrade_q"` names the ground truth `CA-F2-16` measured this against;
    `published_error=COINALYZE_BV_MEASUREMENT.published_error` is what makes this row
    constructible at all — `SeriesCatalogEntry.__post_init__` raises `InvalidCatalogEntryError`
    for any reconstruction attempted without it (`D6.9`, and `test_series_catalog.py`'s own
    `test_reconstruction_without_published_error_is_refused`, which this module's tests
    exercise again with `coinalyze_bv`'s real numbers rather than a copy of them). `unit` is
    required for the same reason as `build_aggtrade_q_entry`'s.
    """
    key = SeriesKey(
        provider="coinalyze",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=CVD_SOURCE_METRIC,
        cohort="all",
        interval="1m",
        unit=unit,
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(
        key=key,
        native_grid="1min",
        max_staleness_ms=120_000,
        reconstructed_from="aggtrade_q",
        published_error=COINALYZE_BV_MEASUREMENT.published_error,
    )


def build_cvd_source_catalog_entries(
    instrument_id: str, *, unit: str, verified_by: str
) -> tuple[SeriesCatalogEntry, ...]:
    """Build every `cvd_source` catalog row this task registers, for one `instrument_id`.

    `REGISTERED_CVD_SOURCES` names the three (`aggtrade_q`, `aggtrade_nq`, `coinalyze_bv`);
    the other three members of `CVD_SOURCES` are `[NÃO MEDIDO]` and not built here (see the
    module docstring).
    """
    return (
        build_aggtrade_q_entry(instrument_id, unit=unit, verified_by=verified_by),
        build_aggtrade_nq_entry(instrument_id, unit=unit, verified_by=verified_by),
        build_coinalyze_bv_entry(instrument_id, unit=unit, verified_by=verified_by),
    )
