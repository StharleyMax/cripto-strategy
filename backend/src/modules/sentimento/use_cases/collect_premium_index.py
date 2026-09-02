"""One collection cycle: fetch the batch, parse it, persist it raw — no shift, no normalization."""

# `docs/plans/SPEC-001-plataforma-dados/03_captura_continua.md` "Nao faz": "Nao aplica shift ao
# gravar. Nao normaliza." This use case stops exactly there: it writes what
# `parse_premium_index_batch` accepted, stamped with WHEN this collector saw it, and nothing
# else. Phase `04` (`T-04.1`/`T-04.2`) is where shift and identity get applied.

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

from src.modules.sentimento.domain.premium_index_batch import (
    InvalidPremiumIndexPayloadError,
    PremiumIndexReading,
    parse_premium_index_batch,
)


@dataclass(frozen=True)
class RawPremiumIndexFetch:
    """What ONE HTTP call to the batch endpoint produced, before any interpretation.

    Exactly one of `status` and `transport_error` is set — the same control
    `domain/ramp_ledger.py`'s `ProbeObservation` enforces, and for the same reason: "the
    request never left this machine" and "the request left and nobody liked the answer" are
    different findings that a single optional field would collapse into the same silence.
    """

    status: int | None = None
    headers: Mapping[str, str] = field(default_factory=dict)
    body: bytes | None = None
    transport_error: str | None = None

    def __post_init__(self) -> None:
        """Reject a fetch that is neither a dispatch nor a failure to dispatch."""
        dispatched = self.status is not None
        if dispatched == (self.transport_error is not None):
            raise ValueError(
                "a fetch must carry either an HTTP status or a transport_error, never both "
                "nor neither"
            )
        if dispatched and self.body is None:
            raise ValueError("a dispatched fetch must carry a body, even if it is empty bytes")

    def header(self, name: str) -> str | None:
        """Read a header case-insensitively, returning `None` when it is absent."""
        wanted = name.lower()
        for key, value in self.headers.items():
            if key.lower() == wanted:
                return value
        return None


class PremiumIndexFetcher(Protocol):
    """Port: one call to the batch endpoint. Implemented live by `infra`, by fakes in tests."""

    def fetch(self) -> RawPremiumIndexFetch: ...  # noqa: D102


class PremiumIndexSink(Protocol):
    """Port: where a cycle's raw readings land. `infra` is the only real implementation."""

    def write(self, received_at: int, readings: tuple[PremiumIndexReading, ...]) -> None: ...  # noqa: D102, E501


class PremiumIndexCycleStage:
    """Where one cycle stopped, so a caller can tell "no data" from "never asked" apart."""

    TRANSPORT = "TRANSPORT"
    """The request never reached the provider, or the provider never answered."""

    DECODE = "DECODE"
    """A body arrived and is not valid JSON."""

    PAYLOAD = "PAYLOAD"
    """Valid JSON, but not a batch this collector can trust (`InvalidPremiumIndexPayloadError`)."""

    WRITTEN = "WRITTEN"
    """The cycle produced readings and they reached the sink."""


@dataclass(frozen=True)
class PremiumIndexCycleResult:
    """The outcome of one collection cycle, with the universe it rests on.

    `n_symbols` is `0` on every non-`WRITTEN` stage BY CONSTRUCTION of `_run` below: nothing
    partially writes. `weight_used` is `None` whenever the header could not be read, which is a
    different fact from "zero weight was spent" — the same asymmetry `quota_bucket.py` already
    draws between a blind bucket and a bucket that reports zero.
    """

    received_at: int
    stage: str
    n_symbols: int
    weight_used: int | None
    status: int | None
    detail: str | None

    @property
    def succeeded(self) -> bool:
        """Return whether this cycle's readings reached the sink."""
        return self.stage == PremiumIndexCycleStage.WRITTEN


def _read_weight(fetch: RawPremiumIndexFetch, weight_header: str) -> int | None:
    """Read the declared weight header, refusing to coerce a non-numeric value into a number."""
    raw = fetch.header(weight_header)
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


def collect_premium_index_once(
    fetcher: PremiumIndexFetcher,
    sink: PremiumIndexSink,
    received_at: int,
    weight_header: str,
) -> PremiumIndexCycleResult:
    """Run exactly one fetch-parse-persist cycle, never partially writing.

    `received_at` is INJECTED (epoch milliseconds, UTC) rather than read from a clock in here:
    `use_cases` may not import `time`/`datetime` (`provenance.py`, "every one of the five
    instants below is an INJECTED VALUE"), so `infra` supplies it the same way it supplies
    every other instant in this codebase.
    """
    fetch = fetcher.fetch()
    if fetch.transport_error is not None:
        return PremiumIndexCycleResult(
            received_at=received_at,
            stage=PremiumIndexCycleStage.TRANSPORT,
            n_symbols=0,
            weight_used=None,
            status=None,
            detail=fetch.transport_error,
        )
    weight_used = _read_weight(fetch, weight_header)
    try:
        decoded: object = json.loads(fetch.body or b"")
    except json.JSONDecodeError as failure:
        return PremiumIndexCycleResult(
            received_at=received_at,
            stage=PremiumIndexCycleStage.DECODE,
            n_symbols=0,
            weight_used=weight_used,
            status=fetch.status,
            detail=f"{type(failure).__name__}: {failure}",
        )
    try:
        readings = parse_premium_index_batch(decoded)
    except InvalidPremiumIndexPayloadError as failure:
        return PremiumIndexCycleResult(
            received_at=received_at,
            stage=PremiumIndexCycleStage.PAYLOAD,
            n_symbols=0,
            weight_used=weight_used,
            status=fetch.status,
            detail=str(failure),
        )
    sink.write(received_at, readings)
    return PremiumIndexCycleResult(
        received_at=received_at,
        stage=PremiumIndexCycleStage.WRITTEN,
        n_symbols=len(readings),
        weight_used=weight_used,
        status=fetch.status,
        detail=None,
    )
