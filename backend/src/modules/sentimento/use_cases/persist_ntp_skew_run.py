"""Turn one clock-skew measurement into the `md.ingest_run` row `D3.10` asks for."""

# `ADR-016`: composing an `IngestRun` from already-measured values is NOT a capability — nothing
# here touches a clock, a socket or a database. The capability already ran
# (`measure_clock_skew`, `infra/binance_server_time_probe.py`); this use case only builds the
# record and hands it to a port that knows how to persist it.

from __future__ import annotations

from typing import Final, Protocol

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION

# `source`/`endpoint` name what this run actually did: one `GET /fapi/v1/time`. `observer_id`
# names THIS probe, not a production collector — `T-03.9` (blocked on `observer_region`) owns
# the broader observer contract for live collectors, and reusing its name here would claim a
# provenance this probe does not have.
SOURCE: Final[str] = "binance-futures"
ENDPOINT: Final[str] = "/fapi/v1/time"
OBSERVER_ID: Final[str] = "ntp-skew-probe-cli"

# `ACCEPTED` is a member of `domain.ingest_record.KNOWN_VERDICTS` — a clean read of `serverTime`
# with no anomaly to flag. Never `ACCEPTED_WITH_WARNING`/`REJECTED`: those are spelled in
# `SPEC-001` for the DATA-collection verdicts, and this run collects no market data.
_VERDICT: Final[str] = "ACCEPTED"


class MissingUsedWeightError(Exception):
    """The provider answered without a usable weight header: refuse to guess `weight_used`."""


class IngestRunRecorder(Protocol):
    """The one write this use case needs from a `md.ingest_run` store."""

    def record_run(self, run: IngestRun) -> None:
        """Persist `run`, committed before returning."""
        ...


def build_ntp_skew_run(
    *,
    run_id: str,
    sample: ClockSkewSample,
    observation: ServerTimeObservation,
    started_at: str,
    ended_at: str,
) -> IngestRun:
    """Build the `IngestRun` row for one NTP-skew probe — never with a fabricated `weight_used`.

    `n_expected`/`n_returned`/`n_written` are all `1`: this run's entire job was to read one
    `serverTime` and persist one skew sample, and it did both, or `measure_clock_skew` would
    have raised before this function was ever called.

    `weight_used` is `md.ingest_run`'s only `NOT NULL` column this probe cannot always fill
    from what it measured — `observation.weight_used` is `None` when the provider sent no
    `x-mbx-used-weight-1m` (`D3.12` already found a Binance family that does exactly this).
    A guessed weight would be worse than no row at all, so this refuses instead of writing one.
    """
    if observation.weight_used is None:
        raise MissingUsedWeightError(
            f"{ENDPOINT} answered without a usable used-weight header: refusing to persist a "
            f"fabricated 'weight_used' for run '{run_id}'"
        )
    return IngestRun(
        run_id=run_id,
        source=SOURCE,
        endpoint=ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=1,
        n_returned=1,
        n_written=1,
        verdict=_VERDICT,
        api_code=observation.http_status,
        src_sha256=observation.body_sha256,
        weight_used=observation.weight_used,
        observer_id=OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=sample.skew_ms(),
        started_at=started_at,
        ended_at=ended_at,
    )


def persist_ntp_skew_measurement(
    recorder: IngestRunRecorder,
    *,
    run_id: str,
    sample: ClockSkewSample,
    observation: ServerTimeObservation,
    started_at: str,
    ended_at: str,
) -> IngestRun:
    """Build the row and persist it, returning what was written so a caller can report it."""
    run = build_ntp_skew_run(
        run_id=run_id,
        sample=sample,
        observation=observation,
        started_at=started_at,
        ended_at=ended_at,
    )
    recorder.record_run(run)
    return run
