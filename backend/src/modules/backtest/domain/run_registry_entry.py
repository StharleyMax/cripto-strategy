"""One row of `backtest.run_registry` — the reproducibility log a backtest run writes.

Columns and types are `ADR-021`/D2, transcribed from `SPEC-001` §3.5 with a type per column.
`created_at` is deliberately ABSENT from this dataclass: `ADR-021`/D2 makes it the one column
that is "auditoria, nunca caminho de decisao" and gives it a database-side default
(`TIMESTAMPTZ NOT NULL DEFAULT now()`) — nothing in `domain`/`use_cases` reads a clock
(`backend/pyproject.toml`, contract "Natureza"), so this type never carries one either. A row
read back from storage carries `created_at` as a plain field on `StoredRunRegistryEntry`
(`postgres_run_registry_store.py`), assembled in `infra`, where reading a timestamp off the
wire is legitimate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention

# `CHAR(64)` sha256 hex, lowercase — `ADR-021`/D2 for `bundle_hash`, and the same shape for
# `partitions_content_hash` ("forma ja decidida por ADR-002/D6"). `hashlib.sha256(...).hexdigest()`
# never emits uppercase, so a mixed-case string here is already a sign the value did not come
# from that call.
_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


class InvalidRunRegistryEntryError(ValueError):
    """A `run_registry` row would violate one of `ADR-021`'s falsifiers (G4, G5) or a type."""


def _require_sha256_hex(value: str, *, field: str) -> None:
    """Refuse a hash field that is not exactly 64 lowercase hex characters."""
    if not _SHA256_HEX.fullmatch(value):
        raise InvalidRunRegistryEntryError(
            f"{field} must be a 64-character lowercase sha256 hex digest, got {value!r}"
        )


def _require_non_empty(value: str, *, field: str) -> None:
    """Refuse an identifier field that is empty or all whitespace."""
    if not value.strip():
        raise InvalidRunRegistryEntryError(f"{field} must not be empty")


@dataclass(frozen=True)
class RunRegistryEntry:
    """A `run_registry` row before it is written — one execution of the (future) engine.

    Every field is required and none defaults: `ADR-021`/D2 lists no optional column, and
    `SPEC-001` §4.4 requires `principal_id` on every row that records a human act, `run_registry`
    named explicitly. `intrabar_convention` and `intrabar_decided_count` are both plain,
    non-optional fields for the same reason (`ADR-021` falsifier G4: one present without the
    other is a defect, and a required pair of fields is a type that cannot express that defect).
    """

    run_id: str
    bundle_hash: str
    window_from_ms: int
    window_to_ms: int
    knowledge_time: int
    partitions_content_hash: str
    commit: str
    intrabar_convention: IntrabarConvention
    intrabar_decided_count: int
    principal_id: str

    def __post_init__(self) -> None:
        """Refuse a row that could not have come from an honest run (`ADR-021` G4/G5, D2)."""
        _require_non_empty(self.run_id, field="run_id")
        _require_non_empty(self.commit, field="commit")
        _require_non_empty(self.principal_id, field="principal_id")
        _require_sha256_hex(self.bundle_hash, field="bundle_hash")
        _require_sha256_hex(self.partitions_content_hash, field="partitions_content_hash")
        if self.window_from_ms > self.window_to_ms:
            raise InvalidRunRegistryEntryError(
                f"window_from_ms ({self.window_from_ms}) must not be greater than "
                f"window_to_ms ({self.window_to_ms})"
            )
        if self.knowledge_time < 0:
            raise InvalidRunRegistryEntryError(
                f"knowledge_time must be an epoch-millisecond value >= 0, got {self.knowledge_time}"
            )
        if self.intrabar_decided_count < 0:
            raise InvalidRunRegistryEntryError(
                f"intrabar_decided_count must be >= 0, got {self.intrabar_decided_count} — it "
                f"counts trades, and `ADR-021`/D5 names it a measure, never a signed adjustment"
            )
