"""One `AvailabilityLagSample` per TRANSITION observed — `lag_ms` is OBSERVED, never estimated."""

# `SPEC-001` §2.2 / `PRD-001` §5.1: `available_at` OBSERVED is "o mais cedo em que um consumidor
# AO VIVO poderia saber". A poll answers with the newest bucket the endpoint has RIGHT NOW; the
# instant this probe can claim an observer "knew" a given `event_time` is the poll where that
# `event_time` FIRST appeared — not every poll that happens to see it again afterwards. This is
# exactly the definition the predecessor measurement used (`docs/plataforma-superficies-e-
# faseamento.md:414`, "n=2 transicoes, 1 simbolo, janela de 10 min") — this module reproduces it
# at the scale of the full `availability_probe_set`, rather than inventing a second definition.
#
# The FIRST successful read of a target is a BASELINE, never a sample: there is no prior instant
# to measure a lag against, and counting it would fabricate `lag_ms = 0` against a bucket this
# probe never watched close.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from src.modules.sentimento.domain.availability_poll import AvailabilityPollAttempt
from src.modules.sentimento.domain.provenance import AvailabilitySource


@dataclass(frozen=True)
class AvailabilityLagSample:
    """One measured transition: a NEW `event_time` first seen at `available_at_ms`."""

    source: str
    endpoint: str
    symbol: str
    observer_region: str
    event_time_ms: int
    available_at_ms: int
    availability_source: AvailabilitySource

    def __post_init__(self) -> None:
        """Refuse a sample where the observer claims to have known before the fact happened."""
        if self.available_at_ms < self.event_time_ms:
            raise ValueError(
                f"available_at_ms ({self.available_at_ms}) precede event_time_ms "
                f"({self.event_time_ms}): um consumidor nao pode saber antes do fato"
            )

    @property
    def lag_ms(self) -> int:
        """Return how many milliseconds after `event_time` this observer first saw the bucket."""
        return self.available_at_ms - self.event_time_ms


def classify_transitions(
    attempts: Sequence[AvailabilityPollAttempt],
) -> tuple[AvailabilityLagSample, ...]:
    """Walk every (source, endpoint, symbol, observer_region) target and emit its transitions.

    Attempts are sorted by `polled_at_ms` first, so a caller does not owe this function an
    ordering (the same lesson `domain/retention_probe.py`'s docstring names for a different
    module: an implicit ordering obligation is a trap, not a convenience). A failed poll, or a
    `200` with nothing to read yet, breaks no streak — it is simply skipped, and the next
    successful read is still compared against the last KNOWN `event_time`, not against `None`.
    """
    ordered = sorted(attempts, key=lambda attempt: attempt.polled_at_ms)
    last_seen: dict[tuple[str, str, str, str], int] = {}
    samples: list[AvailabilityLagSample] = []
    for attempt in ordered:
        event_time_ms = attempt.outcome.latest_event_time_ms
        if not attempt.outcome.is_success or event_time_ms is None:
            continue
        key = (attempt.source, attempt.endpoint, attempt.symbol, attempt.observer_region)
        previous = last_seen.get(key)
        if previous is not None and event_time_ms != previous:
            samples.append(
                AvailabilityLagSample(
                    source=attempt.source,
                    endpoint=attempt.endpoint,
                    symbol=attempt.symbol,
                    observer_region=attempt.observer_region,
                    event_time_ms=event_time_ms,
                    available_at_ms=attempt.polled_at_ms,
                    availability_source=AvailabilitySource.OBSERVED,
                )
            )
        last_seen[key] = event_time_ms
    return tuple(samples)
