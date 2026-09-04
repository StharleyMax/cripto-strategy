"""`SingleAxisSeries` — `ADR-026/D4`: one `denom` field, `switch_denom` replaces, never merges."""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.charts.domain.panel_single_axis import (
    ScalarSlot,
    SingleAxisSeries,
    UnknownDenomError,
    switch_denom,
)

BASE_CONTRACTS_SLOTS = (ScalarSlot(time=0, value=100.0), ScalarSlot(time=60_000, value=101.0))
NOTIONAL_USD_SLOTS = (
    ScalarSlot(time=0, value=5_000_000.0),
    ScalarSlot(time=60_000, value=5_050_000.0),
)


def test_single_axis_series_carries_exactly_one_denom_field() -> None:
    """`ADR-026/D4`: the dataclass has one `denom` field — no representation of a second axis."""
    series = SingleAxisSeries(denom="base_contracts", slots=BASE_CONTRACTS_SLOTS)
    field_names = {f.name for f in series.__dataclass_fields__.values()}
    assert field_names == {"denom", "slots"}
    assert isinstance(series.denom, str)


def test_falsifier_switch_denom_replaces_never_merges() -> None:
    """`ADR-026` falsifier: after the switch, only the NEW denom's slots survive, none merged."""
    current = SingleAxisSeries(denom="base_contracts", slots=BASE_CONTRACTS_SLOTS)
    slots_by_denom = {"base_contracts": BASE_CONTRACTS_SLOTS, "notional_usd": NOTIONAL_USD_SLOTS}

    switched = switch_denom(current, "notional_usd", slots_by_denom)

    assert switched.denom == "notional_usd"
    assert switched.slots == NOTIONAL_USD_SLOTS
    assert switched.slots != current.slots
    # No combined/accumulated view exists: the switched series is not longer than either input.
    assert len(switched.slots) == len(NOTIONAL_USD_SLOTS)


def test_switch_denom_to_an_unknown_denom_is_refused() -> None:
    """A `denom` absent from `slots_by_denom` refuses with a named error, never a bare KeyError."""
    current = SingleAxisSeries(denom="base_contracts", slots=BASE_CONTRACTS_SLOTS)
    with pytest.raises(UnknownDenomError, match="notional_usd"):
        switch_denom(current, "notional_usd", {"base_contracts": BASE_CONTRACTS_SLOTS})


def test_scalar_slot_value_none_is_an_explicit_gap_never_fabricated() -> None:
    """`ScalarSlot.value = None` mirrors the TS `ScalarSlot`: an unfilled grid slot, not a guess."""
    gap = ScalarSlot(time=0, value=None)
    assert gap.value is None


def test_no_type_in_this_module_can_hold_two_denoms_at_once() -> None:
    """Structural check: `SingleAxisSeries` has no field able to carry a second `denom`.

    This is the falsifier `ADR-026` names for `D4` — a tuple, a second optional field, or a
    `str | tuple[str, str]` annotation on `denom` would all fail this assertion.
    """
    denom_field = next(f for f in dataclasses.fields(SingleAxisSeries) if f.name == "denom")
    assert denom_field.type in ("str", str)
    field_names = [f.name for f in dataclasses.fields(SingleAxisSeries)]
    assert field_names.count("denom") == 1
