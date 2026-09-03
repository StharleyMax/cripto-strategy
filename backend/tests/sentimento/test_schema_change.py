"""`SPEC-001` §5.5, `CA-F2-12`, `D6.14`: additive field quarantines, missing/renamed rejects.

The fixture is the REAL case, not a synthetic one — `ADR-001` measured the Binance
`aggTrade` fields: the S3 dump contract is SEVEN keys (`T a f l m p q`), and the REST payload
that motivated this task added an EIGHTH, `nq`. `test_additive_...` below reproduces exactly
that shape instead of inventing an unrelated schema.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.provenance import Absence
from src.modules.sentimento.domain.schema_change import (
    SchemaChangeRejectedError,
    SchemaChangeVerdict,
    classify_schema_change,
)

# The S3 dump's own seven columns, `ADR-001`, transcribed: `['T','a','f','l','m','p','q']`.
AGGTRADE_DUMP_CONTRACT: frozenset[str] = frozenset({"T", "a", "f", "l", "m", "p", "q"})

# The REST payload the day Binance added `nq` — eight keys, `ADR-001` measured verbatim as
# `['T','a','f','l','m','nq','p','q']`.
AGGTRADE_REST_WITH_NQ: frozenset[str] = frozenset({"T", "a", "f", "l", "m", "nq", "p", "q"})


def test_exact_match_is_not_additive_and_carries_no_absence() -> None:
    """A payload matching the contract term-for-term is accepted plainly — no quarantine."""
    verdict = classify_schema_change(
        expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=AGGTRADE_DUMP_CONTRACT
    )

    assert verdict.unknown_fields == frozenset()
    assert verdict.is_additive is False
    assert verdict.absence is None
    assert verdict.should_alarm is False


def test_additive_unknown_field_quarantines_never_rejects() -> None:
    """`D6.14`, the real case: the REST payload gained `nq` over the dump contract.

    `CA-F2-12`'s falsifier is exactly this: a naive fail-closed rule would have raised on
    this payload and stopped the whole ingestion. This test proves the opposite verdict —
    accepted, quarantined, alarmed — never `SchemaChangeRejectedError`.
    """
    verdict = classify_schema_change(
        expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=AGGTRADE_REST_WITH_NQ
    )

    assert verdict.unknown_fields == frozenset({"nq"})
    assert verdict.is_additive is True
    assert verdict.absence is Absence.QUARANTINE
    assert verdict.should_alarm is True


def test_missing_field_rejects_the_whole_payload() -> None:
    """A field the contract expects (`p`, price) is outright absent -> reject, not quarantine."""
    received = AGGTRADE_DUMP_CONTRACT - {"p"}

    with pytest.raises(SchemaChangeRejectedError, match=r"\['p'\]"):
        classify_schema_change(expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=received)


def test_renamed_field_rejects_even_though_the_new_name_looks_additive() -> None:
    """A field renamed (`q` -> `quantity`) is missing under its old name -> reject wins.

    This is the module docstring's "rejection wins" case made concrete: `quantity` alone
    would look additive (it is not in the contract), but `q` vanishing is the signal that
    dominates. A verdict that quarantined this payload instead of rejecting it would be
    treating a silent rename as a harmless extra field.
    """
    received = (AGGTRADE_DUMP_CONTRACT - {"q"}) | {"quantity"}

    with pytest.raises(SchemaChangeRejectedError, match=r"\['q'\]"):
        classify_schema_change(expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=received)


def test_missing_and_additive_together_still_rejects() -> None:
    """Two expected fields gone, one unknown field present: still a reject, named fully."""
    received = (AGGTRADE_DUMP_CONTRACT - {"p", "q"}) | {"price"}

    with pytest.raises(SchemaChangeRejectedError, match=r"\['p', 'q'\]"):
        classify_schema_change(expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=received)


def test_verdict_is_frozen_and_reusable_across_call_sites() -> None:
    """`SchemaChangeVerdict` is a plain frozen dataclass — no hidden mutable state."""
    verdict = SchemaChangeVerdict(
        expected_fields=AGGTRADE_DUMP_CONTRACT, received_fields=AGGTRADE_REST_WITH_NQ
    )

    with pytest.raises(AttributeError):
        verdict.received_fields = frozenset()  # type: ignore[misc]
