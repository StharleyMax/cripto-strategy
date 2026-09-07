"""`collector_status_query`: `ADR-030`'s four formulas over `IngestRecordSource.runs()`.

`ADR-005/D6.1` gets a SEPARATE envelope, not a new column on `/ingest-health` (`ADR-030` D5,
`F-D6-2`/`NG-9`): this use case reads the SAME port `ingest_health_query` already reads
(`IngestRecordSource`, `use_cases/ingest_health.py`), and adds no method to it — `runs()` already
carries `started_at`/`ended_at`, which the 15-column projection deliberately never exposes
(`domain/ingest_record.py` "TABLE only"). `to_envelope()` and the 15 columns are never imported
here, let alone touched.
"""

from __future__ import annotations

import logging
import statistics
from collections import defaultdict
from datetime import datetime, timedelta

from src.modules.sentimento.domain.collector_status import (
    MAX_RUNS_FOR_PERIOD,
    MIN_RUNS_FOR_LIVENESS,
    STALE_AFTER_MULTIPLIER,
    UPTIME_WINDOW_HOURS,
    CollectorStatus,
    CollectorStatusReport,
    CollectorStatusRow,
    Liveness,
    LivenessJudged,
    LivenessNotJudged,
    MalformedRunTimestampError,
    ResilienceNotScored,
    ResilienceUnavailable,
    RetentionNotApplicable,
    RetentionUnmeasured,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.use_cases.ingest_health import IngestRecordSource

logger = logging.getLogger(__name__)

# `ADR-030` D0: series identity, composed exactly the way the front already composes it
# (`ingest-health-query.ts:534`) — no new identity is invented here.
_SERIES_SEPARATOR = " · "


def collector_status_query(source: IngestRecordSource, now: datetime) -> CollectorStatusReport:
    """Group `source.runs()` by `(source, endpoint)` and apply `ADR-030` D1-D4 per series.

    `now` is a PARAMETER (`ADR-030` D0: "e parametro do use case ... nos testes, fixo") — this
    function never calls `datetime.now()` itself, so a caller can hand it a frozen instant and
    get a reproducible report; the route is the one caller that resolves it from the wall clock.

    Raises:
        MalformedRunTimestampError: a run's `ended_at` does not parse as ISO-8601 — `ADR-030`
            D0/F-10 refuses the whole read rather than silently dropping or guessing at the one
            row whose timestamp cannot be trusted.

    """
    runs_by_series: dict[tuple[str, str], list[IngestRun]] = defaultdict(list)
    for run in source.runs():
        # `source.runs()` is already totally ordered by `(started_at, run_id)`
        # (`sqlite_ingest_record_store.py`), so appending in iteration order preserves that
        # order WITHIN each series without this use case sorting anything itself.
        runs_by_series[(run.source, run.endpoint)].append(run)

    # `ADR-030` D0: "Linhas do envelope em ordem (source, endpoint) ascendente."
    rows = tuple(
        _row_for_series(series_source, endpoint, series_runs, now)
        for (series_source, endpoint), series_runs in sorted(runs_by_series.items())
    )
    logger.debug("collector_status_query_read", extra={"n_series": len(rows)})
    return CollectorStatusReport(
        as_of=_format_timestamp(now), window_hours=UPTIME_WINDOW_HOURS, rows=rows
    )


def _row_for_series(
    series_source: str, endpoint: str, series_runs: list[IngestRun], now: datetime
) -> CollectorStatusRow:
    """Build one `CollectorStatusRow`, applying `ADR-030` D1 (status/liveness) then D2-D4."""
    ended_ats = [_parse_timestamp(run.ended_at) for run in series_runs]
    last_run = series_runs[-1]
    last_ended_at = ended_ats[-1]
    age_s_raw = (now - last_ended_at).total_seconds()

    n_runs_total = len(series_runs)
    if n_runs_total >= MIN_RUNS_FOR_LIVENESS:
        window_ended_ats = ended_ats[-MAX_RUNS_FOR_PERIOD:]
        deltas_s = [
            (later - earlier).total_seconds()
            for earlier, later in zip(window_ended_ats, window_ended_ats[1:], strict=False)
        ]
        period_s_raw = statistics.median(deltas_s)
        stale_after_s_raw = STALE_AFTER_MULTIPLIER * period_s_raw
        liveness: Liveness = LivenessJudged(
            period_s=round(period_s_raw), stale_after_s=round(stale_after_s_raw)
        )
        # The status DECISION below compares the RAW (unrounded) values, so rounding for the
        # wire never flips a verdict that sat exactly on the boundary (`ADR-030` F-2).
        is_stale = age_s_raw > stale_after_s_raw
    else:
        liveness = LivenessNotJudged(n_runs=n_runs_total)
        is_stale = False

    status: CollectorStatus
    if last_run.verdict == "REJECTED":
        status = "PARADO"  # `ADR-030` D1 regra A
    elif is_stale:
        status = "PARADO"  # `ADR-030` D1 regra B
    else:
        status = "ATIVO"

    window_start = now - timedelta(hours=UPTIME_WINDOW_HOURS)
    runs_in_window = [
        run
        for run, ended_at in zip(series_runs, ended_ats, strict=True)
        if window_start < ended_at <= now
    ]
    n_expected_in_window = sum(run.n_expected for run in runs_in_window)
    n_written_in_window = sum(run.n_written for run in runs_in_window)
    uptime_percent = (
        round(100 * n_written_in_window / n_expected_in_window, 2)
        if n_expected_in_window > 0
        else None
    )

    retention = RetentionNotApplicable() if status == "PARADO" else RetentionUnmeasured()
    resilience = ResilienceUnavailable() if status == "PARADO" else ResilienceNotScored()

    return CollectorStatusRow(
        series=f"{series_source}{_SERIES_SEPARATOR}{endpoint}",
        source=series_source,
        endpoint=endpoint,
        status=status,
        uptime_percent=uptime_percent,
        status_detail=None,
        retention=retention,
        resilience=resilience,
        n_runs_total=n_runs_total,
        n_runs_in_window=len(runs_in_window),
        last_run_id=last_run.run_id,
        last_verdict=last_run.verdict,
        last_ended_at=last_run.ended_at,
        age_s=round(age_s_raw),
        liveness=liveness,
    )


def _parse_timestamp(value: str) -> datetime:
    """Parse an `ended_at` string as ISO-8601 — `ADR-030` D0: refuse rather than guess."""
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise MalformedRunTimestampError(
            f"collector_status_query cannot parse run timestamp {value!r} as ISO-8601 "
            "(ADR-030 D0) — refusing the whole read instead of guessing at one row."
        ) from exc


def _format_timestamp(value: datetime) -> str:
    """Format `now` as the millisecond-precision `Z`-suffixed ISO-8601 the store's rows use."""
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"
