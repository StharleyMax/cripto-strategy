"""The three-term predicate of `SPEC-001` §5.2 — and the falsifier that proves it is not vacuous.

`D2.6`'s whole claim rests on this predicate being an AND-of-presence, not a single flag that
happens to default to `True`. Every one of the 8 combinations of the three booleans is checked
below so that "quarantined" cannot silently collapse into "always true" or "always false".
"""

from __future__ import annotations

import itertools

import pytest

from src.modules.sentimento.domain.quarantine_terms import (
    COINALYZE_ONE_SHOT_TERMS,
    QuarantineTerms,
)


@pytest.mark.parametrize(
    ("label_shift", "unit", "available_at"),
    list(itertools.product([True, False], repeat=3)),
)
def test_quarantine_is_the_negation_of_all_three_terms_present(
    label_shift: bool, unit: bool, available_at: bool
) -> None:
    """Exhaustive over the 8 combinations: quarantined unless ALL three terms are present."""
    terms = QuarantineTerms(label_shift, unit, available_at)

    assert terms.is_quarantined == (not (label_shift and unit and available_at))


def test_all_three_terms_present_is_the_one_combination_that_is_not_quarantined() -> None:
    """The falsifier: plant the one row `is_quarantined` must reject, and confirm it does."""
    promoted = QuarantineTerms(
        label_shift_present=True, unit_present=True, available_at_present=True
    )

    assert promoted.is_quarantined is False
    assert promoted.open_terms == ()


def test_open_terms_names_every_absent_term_and_only_those() -> None:
    """A reader debugging quarantine needs to know WHICH term, not just THAT it is isolated."""
    terms = QuarantineTerms(
        label_shift_present=True, unit_present=False, available_at_present=False
    )

    assert terms.open_terms == ("unit", "available_at")


def test_the_coinalyze_one_shot_terms_are_quarantined_by_the_available_at_term_alone() -> None:
    """`SPEC-001` §5.2, literal: `unit`/`label_shift` resolved, `available_at` is the open one.

    This is the exact configuration `T-02.2` writes for every row: if `Q19` ever resolves
    `available_at`, this constant is the ONE place that has to change, and every row already
    written keeps whatever it was written with — the constant does not retroactively promote.
    """
    assert COINALYZE_ONE_SHOT_TERMS.is_quarantined is True
    assert COINALYZE_ONE_SHOT_TERMS.open_terms == ("available_at",)
