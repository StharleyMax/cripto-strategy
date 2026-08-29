"""`ingest_health_query`: the ONE named query of `ADR-008/D3`, with two consumers."""

from __future__ import annotations

import logging
from typing import Final, Protocol

from src.modules.sentimento.domain.ingest_record import (
    KNOWN_VERDICTS,
    IngestGap,
    IngestHealthReport,
    IngestRun,
    UnknownVerdictError,
)

logger = logging.getLogger(__name__)

# The name is STABLE and lives in exactly one place: `ADR-008/D3` fixes the name before it
# fixes the columns, because the name is how the second consumer (S1, `T-07.13`/`CST-67`)
# finds THIS function instead of writing its own.
INGEST_HEALTH_QUERY_NAME: Final[str] = "ingest_health_query"


class IngestRecordSource(Protocol):
    """Read port over the PERSISTED `md.ingest_run` / `md.ingest_gap` — never over a log."""

    def runs(self) -> tuple[IngestRun, ...]: ...  # noqa: D102

    def gaps(self) -> tuple[IngestGap, ...]: ...  # noqa: D102


def ingest_health_query(source: IngestRecordSource) -> IngestHealthReport:
    """Read the persisted record and return it in the shape both consumers share.

    ── WHY THE REFUSAL OF AN UNKNOWN `verdict` LIVES HERE AND NOT IN THE DATACLASS ───────

    `IngestRun` is the RAW record: the phase 02 plan says "grava cru + `received_at`", and a
    dataclass that refused values in its constructor would make it IMPOSSIBLE to persist what
    the ingestion edge actually observed. What must never happen is a consumer DISPLAYING a
    run whose `verdict` it does not understand as though it understood it.

    So the refusal sits exactly where `ADR-008/DoD-3` wants it: on the SHARED read path. A
    verdict nobody has heard of, injected into the store, makes BOTH consumers fail together,
    because there is only one place where the decision is taken. If one day one passes and the
    other does not, that proves somebody wrote the second implementation — the one defect the
    whole of `ADR-008` exists to prevent, and it is SILENT by nature.
    """
    runs = source.runs()
    unknown = sorted({run.verdict for run in runs} - KNOWN_VERDICTS)
    if unknown:
        # THE MESSAGE STAYS IN PORTUGUESE, and it is a decision like the `uso:` line of the CLI:
        # `SPEC-001` §3.8 reserves pt-BR EXCLUSIVELY for microcopy, and this text is read by an
        # operator whose F0 record just refused to display a run. Every identifier, docstring
        # and comment around it is English, per the owner's rule.
        raise UnknownVerdictError(
            f"{INGEST_HEALTH_QUERY_NAME} nao conhece o(s) verdict(s) {unknown}; "
            f"conhecidos: {sorted(KNOWN_VERDICTS)}. Os dois consumidores mudam juntos "
            f"(ADR-008/DoD-3) — esconder a execucao seria a duplicacao silenciosa."
        )
    gaps = source.gaps()
    # DEBUG AND NOT INFO, and the level is load-bearing rather than taste: this record shares
    # a call path with the CLI report, whose `stdout` is a byte contract (`ADR-008/DoD-2`).
    # A library that logs at INFO imposes its volume on every host; DEBUG is the level whose
    # contract is "off unless somebody asks". The other half of the fix is the stream split in
    # `infra/ingest_health_cli.py`, which holds even when somebody DOES ask.
    logger.debug(
        "ingest_health_query_read",
        extra={"runs": len(runs), "gaps": len(gaps)},
    )
    return IngestHealthReport(runs=runs, gaps=gaps)
