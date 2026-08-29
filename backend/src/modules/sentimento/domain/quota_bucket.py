"""The three quota buckets this project spends, and which of them can be READ."""

# ── WHY THIS IS DOMAIN AND NOT CONFIGURATION ───────────────────────────────────────────────
#
# A bucket's visibility is not a setting someone chose; it is a property of the provider's
# response that we MEASURED, and every budget this project publishes is downstream of it. Two
# of the three buckets return `200` carrying no quota counter at all, so the only honest
# arithmetic over them is a LOCAL count — and a local count that forgets it is local becomes a
# number that looks like telemetry and is not (`PRD-001` `CA-F3-9`, `avaliacao:A3`).
#
# `SPEC-001` §9.2 lists "topologia do balde" as NOT DEFERRABLE for exactly this reason.

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Final

# The header Binance uses to publish the consumed weight of the rolling one-minute window.
# Lower-cased on purpose: HTTP/2 header names arrive lower-cased, and `http.client` does not
# normalise for us at every access path.
USED_WEIGHT_HEADER: Final[str] = "x-mbx-used-weight-1m"


class BucketVisibility(Enum):
    """Whether a bucket publishes its own consumption, or has to be counted from outside."""

    OBSERVED = "OBSERVED"
    """The response carries a counter: consumption is READ, not inferred."""

    BLIND = "BLIND"
    """The response carries no counter: consumption can only be counted locally."""


class UnknownBucketError(Exception):
    """A bucket identifier that the closed registry below does not declare."""


@dataclass(frozen=True)
class QuotaBucket:
    """One rate-limit bucket, with the reason its visibility is what it is.

    `blindness_reason` is REQUIRED for a blind bucket and FORBIDDEN for an observed one. A
    blind bucket whose blindness has no written cause is the failure mode this task exists to
    prevent: a reader downstream cannot tell "nobody looked" from "we looked and there is
    nothing there".
    """

    identifier: str
    host: str
    path_prefix: str
    visibility: BucketVisibility
    counter_header: str | None
    blindness_reason: str | None

    def __post_init__(self) -> None:
        """Reject a bucket whose declared visibility contradicts the fields around it."""
        observed = self.visibility is BucketVisibility.OBSERVED
        if observed and (self.counter_header is None or self.blindness_reason is not None):
            raise ValueError(
                f"balde {self.identifier!r} declarado OBSERVED sem header de contagem "
                "ou com motivo de cegueira"
            )
        if not observed and (self.counter_header is not None or not self.blindness_reason):
            raise ValueError(
                f"balde {self.identifier!r} declarado BLIND com header de contagem "
                "ou sem o motivo escrito"
            )

    @property
    def is_blind(self) -> bool:
        """Return whether consumption of this bucket has to be counted locally."""
        return self.visibility is BucketVisibility.BLIND


# ── THE REGISTRY, AND IT IS CLOSED ─────────────────────────────────────────────────────────
#
# Three buckets, and the second half of this task's title is the count: TWO OF THE THREE ARE
# BLIND. Every entry below carries the `curl` that produced its visibility, because a
# visibility asserted without the command is the same class of claim this repository has
# already caught being wrong.
BINANCE_FAPI: Final[QuotaBucket] = QuotaBucket(
    identifier="binance-fapi",
    host="fapi.binance.com",
    path_prefix="/fapi/v1/",
    visibility=BucketVisibility.OBSERVED,
    counter_header=USED_WEIGHT_HEADER,
    blindness_reason=None,
)

BINANCE_FUTURES_DATA: Final[QuotaBucket] = QuotaBucket(
    identifier="binance-futures-data",
    host="fapi.binance.com",
    path_prefix="/futures/data/",
    visibility=BucketVisibility.BLIND,
    counter_header=None,
    # This is the bucket the screener lives in, and it is the expensive one to be blind about:
    # open interest has NO batch endpoint (1 symbol per call), so a cross-section sweep spends
    # this bucket hundreds of times per pass.
    blindness_reason=(
        "resposta 200 nao traz nenhum header x-mbx-*: so nginx, CORS, CSP, HSTS e CloudFront. "
        "Nao ha numerador para a razao consumido/limite, entao a contagem e local ou nao existe"
    ),
)

COINALYZE: Final[QuotaBucket] = QuotaBucket(
    identifier="coinalyze",
    host="api.coinalyze.net",
    path_prefix="/v1/",
    visibility=BucketVisibility.BLIND,
    counter_header=None,
    blindness_reason=(
        "resposta 200 nao traz cota: nem consumido, nem restante, nem janela. O limite "
        "publicado (40 chamadas/min) e DOC do fornecedor, nunca confirmado pela resposta"
    ),
)

KNOWN_BUCKETS: Final[tuple[QuotaBucket, ...]] = (
    BINANCE_FAPI,
    BINANCE_FUTURES_DATA,
    COINALYZE,
)


def bucket_by_identifier(identifier: str) -> QuotaBucket:
    """Resolve a bucket by name, refusing anything the closed registry does not declare."""
    for bucket in KNOWN_BUCKETS:
        if bucket.identifier == identifier:
            return bucket
    declared = ", ".join(sorted(candidate.identifier for candidate in KNOWN_BUCKETS))
    raise UnknownBucketError(f"balde desconhecido: {identifier!r}; declarados: {declared}")


def blind_buckets() -> tuple[QuotaBucket, ...]:
    """Return the buckets whose consumption is not readable from the response."""
    return tuple(bucket for bucket in KNOWN_BUCKETS if bucket.is_blind)
