"""`FieldIdentity` — `ADR-020/D1`: `(metric, unit, denom)`, no blank term."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.field_identity import (
    FIELD_IDENTITY_TERMS,
    FieldIdentity,
    IncompleteFieldIdentityError,
)


def test_field_identity_terms_match_the_dataclass_field_order() -> None:
    """`FIELD_IDENTITY_TERMS` is the same order the dataclass itself declares."""
    assert FIELD_IDENTITY_TERMS == ("metric", "unit", "denom")


def test_two_identical_triples_are_the_same_field() -> None:
    """Two `FieldIdentity` built from the same three terms compare equal and hash equal."""
    a = FieldIdentity(metric="sum_open_interest_value", unit="pct", denom="none")
    b = FieldIdentity(metric="sum_open_interest_value", unit="pct", denom="none")
    assert a == b
    assert hash(a) == hash(b)


def test_denom_alone_distinguishes_two_fields() -> None:
    """`CA-F4-13`: the same metric with a different `denom` is a DIFFERENT field."""
    base_contracts = FieldIdentity(
        metric="sum_open_interest_value", unit="pct", denom="base_contracts"
    )
    notional_usd = FieldIdentity(metric="sum_open_interest_value", unit="pct", denom="notional_usd")
    assert base_contracts != notional_usd


@pytest.mark.parametrize("term", ["metric", "unit", "denom"])
def test_a_blank_term_is_refused(term: str) -> None:
    """Any one of the three terms left blank refuses construction."""
    terms = {"metric": "sum_open_interest_value", "unit": "pct", "denom": "none"}
    terms[term] = "   "
    with pytest.raises(IncompleteFieldIdentityError, match=term):
        FieldIdentity(**terms)
