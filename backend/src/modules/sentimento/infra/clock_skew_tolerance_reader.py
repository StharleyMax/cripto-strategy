"""Turn persisted `md.ingest_run` rows into the `ClockSkewObservation`s calibration reads."""

# `Natureza`: parsing `IngestRun.started_at`'s stored ISO-8601 string into epoch milliseconds
# is where a timestamp stops being an opaque string and starts being read as a value — the same
# boundary `infra/metrics_csv_reader.py:parse_create_time_ms` draws for `daily/metrics`
# timestamps, and it belongs here rather than in `domain`/`use_cases` for the identical reason.

from __future__ import annotations

from datetime import datetime

from src.modules.sentimento.domain.clock_skew_tolerance import ClockSkewObservation
from src.modules.sentimento.use_cases.ingest_health import IngestRecordSource


def parse_iso_ms(text: str) -> int:
    """Parse an ISO-8601 `...Z` timestamp (`IngestRun.started_at`'s stored shape) to epoch ms.

    `ntp_skew_probe_cli.iso_ms` is this function's inverse — it renders epoch ms back to the
    exact `...Z` shape this parses. `fromisoformat` needs an explicit offset, not a trailing
    `Z`, so the swap is the one transformation this function performs before delegating parsing
    to the standard library.
    """
    return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000)


class IngestRunClockSkewSource:
    """Adapt an `IngestRecordSource` (e.g. `SqliteIngestRecordStore`) into `ClockSkewHistorySource`.

    Every `md.ingest_run` row carries its own `clock_skew_ms` (`ADR-008/D3`) — not only the
    NTP-probe rows `T-03.8` writes — so this reads ALL runs in the store, not a filtered subset.
    A run whose `started_at` cannot be parsed as ISO-8601 is a store invariant violated
    upstream; this adapter does not catch that and re-raise it as something friendlier, because
    swallowing it would hide a corrupt row behind a calibration that silently used fewer samples
    than the store actually holds.
    """

    def __init__(self, record_source: IngestRecordSource) -> None:
        """Wrap `record_source`, read lazily on every `observations()` call."""
        self._record_source = record_source

    def observations(self) -> tuple[ClockSkewObservation, ...]:
        """Return one `ClockSkewObservation` per persisted `md.ingest_run` row."""
        return tuple(
            ClockSkewObservation(
                clock_skew_ms=run.clock_skew_ms,
                observed_at_ms=parse_iso_ms(run.started_at),
            )
            for run in self._record_source.runs()
        )
