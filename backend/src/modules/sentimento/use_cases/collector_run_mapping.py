"""Map one closed session or one completed cycle onto the `IngestRun` `Q3` fixes.

`gates/Q3-run-definition.md` (`SPEC-004` §3.3, `ADR-031/D3`) is what "one run" means for one
closed `!forceOrder@arr` SESSION or one completed `premiumIndex` CYCLE, and this module is where
that shape is built.

`ADR-016`: composing an `IngestRun` from already-observed values is NOT a capability — nothing
here touches a socket, a clock or a database. `infra/collectors_cli.py` is the composition root
that calls these two builders at session/cycle close and hands the result to `record_run` on the
store it wired; this module is the ONE place the 16-field shape is decided, so the composition
root and this module's own tests share exactly one construction, never two (the defect
`ADR-008/DoD-3` names for the read side, applied here to the WRITE side).

`gates/Q3-run-definition.md` §3 fixes the two sentinels below as PHYSICALLY IMPOSSIBLE values
for the quantity they stand in for, so neither can ever collide with something actually
measured: `CLOCK_SKEW_NOT_MEASURED_MS` is a skew no real clock is off by (24+ days); `-1` is a
REST weight no real response header ever carries (weight is always `>= 0`). Both are documented
by name rather than left as bare literals, matching `domain/ingest_record.py`'s own
`LOSS_WINDOW_NOT_COMPUTED_IN_F0` precedent for "a value, never absent, never a guess".
"""

from __future__ import annotations

import hashlib
from typing import Final, Literal, get_args
from uuid import uuid4

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.use_cases.persist_ntp_skew_run import SOURCE

# ── Q3 §2.1 — THE LITERAL `endpoint` PER PRODUCER, DISTINCT BY CONSTRUCTION ────────────────
FORCE_ORDER_ENDPOINT: Final[str] = "!forceOrder@arr"

# ── Q3 §3 — THE SENTINELS AND THE OBSERVER LITERALS, NONE OF THEM A GUESS ──────────────────
# The WS collector spends no REST weight — a FACT (`0`), never a guess.
FORCE_ORDER_WEIGHT_USED: Final[int] = 0
# Physically impossible for a real skew measurement (24+ days off), so it can never be confused
# with one; the production collectors do not measure skew per session/cycle (`Q3` §3).
CLOCK_SKEW_NOT_MEASURED_MS: Final[int] = -2_147_483_648
# A real REST weight is always `>= 0`, so `-1` can never collide with one (`Q3` §3).
WEIGHT_NOT_READABLE: Final[int] = -1
# Names the PRODUCTION collector, distinct from the diagnostic probes (`Q3` §3).
FORCE_ORDER_OBSERVER_ID: Final[str] = "forceorder-collector"
PREMIUM_INDEX_OBSERVER_ID: Final[str] = "premiumindex-collector"

# ── THE CLOSED SET, RESTATED AS A `Literal` FOR THE ONE CALLER THAT MANUFACTURES RUNS ──────
#
# `domain/ingest_record.KNOWN_VERDICTS` stays a runtime `frozenset` because `IngestRun` is the
# RAW record (`use_cases/ingest_health.py`'s own docstring: the refusal of an unknown verdict
# belongs on the SHARED READ path, never in the dataclass, so a dirtier future writer can still
# persist what it actually observed). This module is different: it is the ONE controlled
# construction site Q3 describes, fed only by this package's own two collector threads — so the
# three spellings are fixed at the TYPE level here, and `test_collector_run_mapping.py` pins
# that this tuple and `KNOWN_VERDICTS` never drift apart.
KnownVerdict = Literal["ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"]
KNOWN_VERDICT_LITERALS: Final[tuple[str, ...]] = get_args(KnownVerdict)


def build_force_order_run(
    started_at: str,
    ended_at: str,
    n_published: int,
    verdict: KnownVerdict,
    digest: hashlib._Hash,
) -> IngestRun:
    """Build the `IngestRun` for one `!forceOrder@arr` SESSION close (`Q3` §1.1, §3).

    `n_expected = n_returned = n_published`: `Q3` §3 (c) — there is no independent oracle for
    how many liquidations SHOULD have arrived, so inventing one would be exactly the number
    without a command that produced it this repository refuses. `digest` is the SESSION's
    running `sha256`, updated by the caller with every raw message's bytes as it arrives
    (`Q3` §3: an incremental hash avoids holding hours of messages in memory just to hash them
    at close).
    """
    return IngestRun(
        run_id=str(uuid4()),
        source=SOURCE,
        endpoint=FORCE_ORDER_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_published,
        n_returned=n_published,
        n_written=0,
        verdict=verdict,
        api_code=None,
        src_sha256=digest.hexdigest(),
        weight_used=FORCE_ORDER_WEIGHT_USED,
        observer_id=FORCE_ORDER_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
    )


def build_premium_index_run(
    started_at: str,
    ended_at: str,
    n_symbols: int,
    status: int | None,
    weight_used: int | None,
    verdict: KnownVerdict,
    src_sha256: str,
) -> IngestRun:
    """Build the `IngestRun` for one `premiumIndex` poll CYCLE (`Q3` §1.2, §3).

    `weight_used=None` (the provider answered this specific poll without a readable
    `x-mbx-used-weight-1m`) becomes `WEIGHT_NOT_READABLE` rather than aborting the process —
    `Q3` §3 (i): a 24/7 collector cannot end the run over one missing metadata header on a poll
    that otherwise published successfully, unlike the one-shot probe `persist_ntp_skew_run.py`
    refuses for.
    """
    return IngestRun(
        run_id=str(uuid4()),
        source=SOURCE,
        endpoint=PREMIUM_INDEX_ENDPOINT,
        window=f"{started_at}/{ended_at}",
        n_expected=n_symbols,
        n_returned=n_symbols,
        n_written=0,
        verdict=verdict,
        api_code=status,
        src_sha256=src_sha256,
        weight_used=weight_used if weight_used is not None else WEIGHT_NOT_READABLE,
        observer_id=PREMIUM_INDEX_OBSERVER_ID,
        observer_region=UNKNOWN_OBSERVER_REGION,
        clock_skew_ms=CLOCK_SKEW_NOT_MEASURED_MS,
        started_at=started_at,
        ended_at=ended_at,
    )
