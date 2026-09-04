"""`Observation`/`ObservationVerdict` — `ADR-022/D1`/`D3`: identity + value + real `n_obs`."""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.charts.domain.observation import (
    Fired,
    IncompleteObservationError,
    Insufficient,
    NotFired,
    Observation,
)


def test_two_identical_triples_are_equal() -> None:
    """Two `Observation`s built from the same three terms compare equal."""
    a = Observation(instrument_id="BTCUSDT", value=1.2, n_obs=2016)
    b = Observation(instrument_id="BTCUSDT", value=1.2, n_obs=2016)
    assert a == b


def test_a_blank_instrument_id_is_refused() -> None:
    """`instrument_id` left blank (or all whitespace) refuses construction."""
    with pytest.raises(IncompleteObservationError, match="instrument_id"):
        Observation(instrument_id="   ", value=1.0, n_obs=1)


@pytest.mark.parametrize("n_obs", [0, -1, -100])
def test_a_non_positive_n_obs_is_refused(n_obs: int) -> None:
    """`n_obs < 1` refuses — a value cannot rest on zero or fewer real observations."""
    with pytest.raises(IncompleteObservationError, match="n_obs"):
        Observation(instrument_id="BTCUSDT", value=1.0, n_obs=n_obs)


def test_n_obs_of_one_is_the_atomic_floor_and_is_accepted() -> None:
    """`n_obs=1` — a field that is already atomic, no rolling aggregation — is valid."""
    observation = Observation(instrument_id="BTCUSDT", value=1.0, n_obs=1)
    assert observation.n_obs == 1


def test_insufficient_carries_no_value_field() -> None:
    """`ADR-022/D3`'s rejected alternative: no `low_confidence`-flagged value, ever.

    Absence of a value field is the only form that does not depend on a caller's discipline to
    ignore a flag.
    """
    field_names = {f.name for f in dataclasses.fields(Insufficient)}
    assert field_names == {"instrument_id", "n_obs", "min_obs_required"}


def test_fired_and_not_fired_share_the_same_shape() -> None:
    """`Fired`/`NotFired` are the same fields, opposite verdicts — a UI renders one column."""
    fired_fields = {f.name for f in dataclasses.fields(Fired)}
    not_fired_fields = {f.name for f in dataclasses.fields(NotFired)}
    assert fired_fields == not_fired_fields == {"instrument_id", "z_or_percentile_value", "n_obs"}
