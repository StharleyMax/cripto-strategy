"""Orchestrate reading `clock_skew_ms` history and handing it to the pure calibration."""

# `ADR-016`: composing already-read observations into a calibration is NOT a capability —
# nothing here touches a clock, a socket or a database. The capability (reading `md.ingest_run`
# and turning its stored ISO timestamps into epoch milliseconds) is `infra`'s job
# (`infra/clock_skew_tolerance_reader.py`); this use case only asks a port for the observations
# and hands them to `domain.clock_skew_tolerance.calibrate_clock_skew_tolerance`.

from __future__ import annotations

import logging
from typing import Protocol

from src.modules.sentimento.domain.clock_skew_tolerance import (
    ClockSkewObservation,
    ClockSkewTolerance,
    calibrate_clock_skew_tolerance,
)

logger = logging.getLogger(__name__)


class ClockSkewHistorySource(Protocol):
    """Read port over the already-parsed `clock_skew_ms` history — never a raw store row."""

    def observations(self) -> tuple[ClockSkewObservation, ...]:  # noqa: D102
        ...


def calibrate_clock_skew_tolerance_from_history(
    source: ClockSkewHistorySource,
) -> ClockSkewTolerance:
    """Read the history through `source` and calibrate — or let the refusal propagate.

    This function does not catch `InsufficientClockSkewCalibrationDataError`: a caller that
    wants to keep running with "no tolerance yet" has to decide that explicitly, the same way
    `use_cases/persist_ntp_skew_run.py` lets `MissingUsedWeightError` propagate instead of
    swallowing it into a fabricated default.
    """
    observations = source.observations()
    tolerance = calibrate_clock_skew_tolerance(observations)
    logger.debug(
        "clock_skew_tolerance_calibrated",
        extra={
            "sample_n": tolerance.sample_n,
            "span_days": tolerance.span_days,
            "tolerance_ms": tolerance.tolerance_ms,
        },
    )
    return tolerance
