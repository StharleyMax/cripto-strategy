"""`series_quarantine_query`: the read query behind `GET /series-quarantine` (`D3.2`)."""

from __future__ import annotations

import logging
from typing import Protocol

from src.modules.sentimento.domain.series_quarantine_report import (
    QuarantineRow,
    SeriesQuarantineReport,
)

logger = logging.getLogger(__name__)


class QuarantineSource(Protocol):
    """Read port over the persisted `series_quarantine` table — never a raw SQL statement.

    `list_all()` is the ONLY method this port names: `D3.2`'s falsifier is about a route that
    physically cannot leak `points_json`, and a port that named a second, wider read (like
    `read_latest`, `T-03.11`'s reconciliation path) would let a future edit reach for it here
    by mistake.
    """

    def list_all(self) -> tuple[QuarantineRow, ...]: ...  # noqa: D102


def series_quarantine_query(source: QuarantineSource) -> SeriesQuarantineReport:
    """Read every quarantined row and return it in the shape `GET /series-quarantine` projects.

    `source` is a port, injected — this function never knows which adapter answers it, the
    same shape `ingest_health_query` already gives `IngestRecordSource`.
    """
    rows = source.list_all()
    logger.debug("series_quarantine_query_read", extra={"rows": len(rows)})
    return SeriesQuarantineReport(rows=rows)
