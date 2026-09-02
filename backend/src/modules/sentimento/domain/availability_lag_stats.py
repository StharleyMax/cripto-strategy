"""The lag table `SPEC-001` §2.2 requires: `p99`+`n` as COLUMNS, keyed by `(endpoint, region)`."""

# `PRD-001` §5.1/D-04, literal: "a tabela de defasagem grava `lag_stat`, `lag_n`,
# `lag_resolution_s`, `lag_window` como COLUNAS, nao como rodape — porque rodape nao e lido por
# consumidor de maquina, e e consumidor de maquina que carimba." `LagSummaryRow` below is that
# row, one per `(endpoint, observer_region)` — `docs/specs/SPEC-001-plataforma-dados.md:134`:
# "A tabela de defasagem e chaveada por (endpoint, observer_region), nao por endpoint."
#
# `lag_stat` is a CONSTANT, not a choice made per call: `PRD-001` §5.1 measured that mean/median
# are optimistic in half of all cases and that mislabelling a bucket by one step flips the sign
# of a 15-minute delta-OI in 21,96% of windows (n=8.629) — "nao e base para um estimador
# central". `p99` is the one statistic this module ever computes.
#
# `D3.4`: the `OBSERVED/total` ratio is DISPLAYED, never estimated, over EVERY line of the
# measurement window — `LagSummaryRow.observed_ratio` divides `lag_n` (transitions actually
# classified) by `total_polls` (every attempt this probe made for that key, success or not).

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.availability_lag import AvailabilityLagSample
from src.modules.sentimento.domain.availability_poll import AvailabilityPollAttempt

LAG_STAT_NAME: Final[str] = "p99"


class EmptyLagSampleError(Exception):
    """A percentile of zero samples does not exist — refusing beats returning a fabricated `0`."""


def p99(values: Sequence[int]) -> int:
    """Return the 99th percentile by the nearest-rank method: the `ceil(0.99 * n)`-th smallest.

    Nearest-rank rather than interpolated, because every input here is already a whole
    millisecond count — interpolating between two real measurements would manufacture a value
    nobody observed, the same objection `domain/retention_probe.py`'s `size_ratio_alarm`
    raises against turning an ALARM into a fabricated count.
    """
    if not values:
        raise EmptyLagSampleError("p99 of an empty set does not exist")
    ordered = sorted(values)
    rank = math.ceil(0.99 * len(ordered))
    index = max(0, rank - 1)
    return ordered[index]


@dataclass(frozen=True)
class LagSummaryRow:
    """One row of the lag table, keyed by `(endpoint, observer_region)` — never by `endpoint`."""

    endpoint: str
    observer_region: str
    lag_stat: str
    lag_p99_ms: int | None
    lag_n: int
    lag_resolution_s: float
    lag_window_s: int
    total_polls: int

    def __post_init__(self) -> None:
        """Refuse a row whose `p99` and `n` disagree about whether anything was observed."""
        if (self.lag_n == 0) != (self.lag_p99_ms is None):
            raise ValueError(
                f"lag_n={self.lag_n} and lag_p99_ms={self.lag_p99_ms!r}: the two must agree on "
                f"whether there is an observation (n=0 <=> p99=None)"
            )
        if self.lag_n > self.total_polls:
            raise ValueError(
                f"lag_n={self.lag_n} > total_polls={self.total_polls}: there cannot be more "
                f"transitions than poll attempts"
            )

    @property
    def observed_ratio(self) -> float:
        """Return `OBSERVED/total`, DISPLAYED never estimated (`D3.4`) — over every polled line."""
        if self.total_polls == 0:
            return 0.0
        return self.lag_n / self.total_polls


def summarize_lag(
    samples: Sequence[AvailabilityLagSample],
    attempts: Sequence[AvailabilityPollAttempt],
    resolution_seconds_by_source: Mapping[str, float],
) -> tuple[LagSummaryRow, ...]:
    """Group every sample and every attempt by `(endpoint, observer_region)` and summarize each.

    A key with polls but ZERO transitions still gets a row — `lag_n=0`, `lag_p99_ms=None` — so
    `D3.4`'s ratio is visible even where the probe learned nothing yet, instead of the endpoint
    silently vanishing from the table. `resolution_seconds_by_source` maps a `source` identifier
    (`QuotaBucket.identifier`, e.g. `"binance-futures-data"`/`"coinalyze"`) to the period that
    source was actually polled at — `lag_resolution_s` is a property of the PROBE, not of the
    sample, so it cannot be derived from the samples alone.
    """
    samples_by_key: dict[tuple[str, str], list[AvailabilityLagSample]] = {}
    for sample in samples:
        samples_by_key.setdefault((sample.endpoint, sample.observer_region), []).append(sample)

    polled_at_by_key: dict[tuple[str, str], list[int]] = {}
    source_by_key: dict[tuple[str, str], str] = {}
    for attempt in attempts:
        key = (attempt.endpoint, attempt.observer_region)
        polled_at_by_key.setdefault(key, []).append(attempt.polled_at_ms)
        source_by_key[key] = attempt.source

    rows: list[LagSummaryRow] = []
    for key in sorted(polled_at_by_key):
        endpoint, observer_region = key
        polled_at = polled_at_by_key[key]
        group = samples_by_key.get(key, [])
        lag_values = [sample.lag_ms for sample in group]
        source = source_by_key[key]
        rows.append(
            LagSummaryRow(
                endpoint=endpoint,
                observer_region=observer_region,
                lag_stat=LAG_STAT_NAME,
                lag_p99_ms=p99(lag_values) if lag_values else None,
                lag_n=len(lag_values),
                lag_resolution_s=resolution_seconds_by_source[source],
                lag_window_s=(max(polled_at) - min(polled_at)) // 1000,
                total_polls=len(polled_at),
            )
        )
    return tuple(rows)
