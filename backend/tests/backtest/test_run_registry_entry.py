"""`RunRegistryEntry.__post_init__` — the type-level half of `ADR-021`'s falsifiers G4/G5."""

from __future__ import annotations

import pytest

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.run_registry_entry import (
    InvalidRunRegistryEntryError,
    RunRegistryEntry,
)

_VALID_HASH = "a" * 64


def _build(**overrides: object) -> RunRegistryEntry:
    """Build a valid `RunRegistryEntry`, with `overrides` replacing individual fields."""
    fields: dict[str, object] = {
        "run_id": "run-1",
        "bundle_hash": _VALID_HASH,
        "window_from_ms": 1_000,
        "window_to_ms": 2_000,
        "knowledge_time": 2_000,
        "partitions_content_hash": _VALID_HASH,
        "commit": "deadbeef",
        "intrabar_convention": IntrabarConvention.PESSIMISTIC_STOP_FIRST,
        "intrabar_decided_count": 0,
        "principal_id": "stharley",
        "grid_version": 1,
    }
    fields.update(overrides)
    return RunRegistryEntry(**fields)  # type: ignore[arg-type]


def test_a_well_formed_entry_is_accepted() -> None:
    """The happy path: every `ADR-021`/D2 column present and well-typed."""
    entry = _build()
    assert entry.run_id == "run-1"
    assert entry.intrabar_convention is IntrabarConvention.PESSIMISTIC_STOP_FIRST


@pytest.mark.parametrize("field", ["run_id", "commit", "principal_id"])
def test_empty_identifier_fields_are_refused(field: str) -> None:
    """`run_id`, `commit` and `principal_id` (`SPEC-001` §4.4, G5) must not be empty."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(**{field: ""})


@pytest.mark.parametrize("field", ["bundle_hash", "partitions_content_hash"])
def test_malformed_hash_fields_are_refused(field: str) -> None:
    """A hash field that is not 64 lowercase hex characters cannot have come from `sha256`."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(**{field: "NOT-A-SHA256-DIGEST"})


def test_window_from_after_window_to_is_refused() -> None:
    """A window where the start is after the end cannot describe a real read."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(window_from_ms=2_000, window_to_ms=1_000)


def test_negative_knowledge_time_is_refused() -> None:
    """`knowledge_time` is an epoch-millisecond value; negative is not a valid instant."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(knowledge_time=-1)


def test_negative_intrabar_decided_count_is_refused() -> None:
    """`intrabar_decided_count` counts trades (`ADR-021`/D5) — it cannot be negative."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(intrabar_decided_count=-1)


def test_negative_grid_version_is_refused() -> None:
    """`grid_version` is a monotonic counter owned by `charts` (`ADR-025`/D3) — never negative."""
    with pytest.raises(InvalidRunRegistryEntryError):
        _build(grid_version=-1)


def test_omitting_intrabar_convention_cannot_construct_a_row_at_all() -> None:
    """G4: the convention/count pair travels together by TYPE, not by a runtime check.

    Both fields are required, defaultless dataclass members — Python itself refuses the call
    with `TypeError` before `__post_init__` ever runs, which is a stronger guarantee than a
    validation branch: there is no code path that reaches storage with one present and the
    other absent.
    """
    fields: dict[str, object] = {
        "run_id": "run-1",
        "bundle_hash": _VALID_HASH,
        "window_from_ms": 1_000,
        "window_to_ms": 2_000,
        "knowledge_time": 2_000,
        "partitions_content_hash": _VALID_HASH,
        "commit": "deadbeef",
        "intrabar_decided_count": 0,
        "principal_id": "stharley",
        "grid_version": 1,
    }
    with pytest.raises(TypeError):
        RunRegistryEntry(**fields)  # type: ignore[arg-type]
