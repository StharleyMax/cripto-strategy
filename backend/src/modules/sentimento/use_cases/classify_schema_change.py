"""The WHEN of the alarm `SPEC-001` §5.5 requires for an additive schema change — not the WHERE."""

# `T-06.8`'s handoff is explicit about the boundary this module holds: "esta task decide QUANDO
# alarmar (o predicado: campo aditivo desconhecido), não POR ONDE o alarme sai". `T-07.11` (`plan
# 07`, `CST-65`) is the task that owns an alarm channel outside the browser, and it is `blocked`
# on `Q3` (which transport) as of this task — there is no channel yet to call into.
#
# SCOPE NOT CLOSED, NAMED EXPLICITLY: until `T-07.11` unblocks, "alarme" here means a structured
# log event at `WARNING`, in English per `CLAUDE.md`'s log-event line (`SPEC-002` §6.1) — a
# future consumer (a log shipper, `T-07.11`'s eventual channel) reads
# `schema_change_additive_unknown` off the log stream. It is a flag a consumer CAN read, not a
# notification anyone is DELIVERED yet, and that gap is this module's, not `T-07.11`'s: closing
# it is wiring a real transport, which is exactly what `T-07.11` is blocked from doing.

from __future__ import annotations

import logging

from src.modules.sentimento.domain.schema_change import (
    SchemaChangeVerdict,
    classify_schema_change,
)

logger = logging.getLogger(__name__)


def classify_and_alarm(
    *, subject: str, expected_fields: frozenset[str], received_fields: frozenset[str]
) -> SchemaChangeVerdict:
    """Classify one payload's schema and emit the alarm event for the additive case.

    `subject` names WHAT was classified (an endpoint, a symbol-day, a file) — it rides in
    `extra` so the log event is traceable to a payload, the same shape
    `ingest_verified_payload.py`'s `ingestion_verified` event already uses.

    Never stops ingestion: a `SchemaChangeRejectedError` from `classify_schema_change`
    propagates UNLOGGED by this function on purpose — `SPEC-001` §5.5's reject branch is a
    refusal of the payload, not an alarm condition, and giving it a log event here would blur
    the two reactions this module exists to keep apart.
    """
    verdict = classify_schema_change(
        expected_fields=expected_fields, received_fields=received_fields
    )
    if verdict.should_alarm:
        logger.warning(
            "schema_change_additive_unknown",
            extra={"subject": subject, "unknown_fields": sorted(verdict.unknown_fields)},
        )
    return verdict
