"""The three-term predicate of `SPEC-001` §5.2 — and the falsifier that proves it is not vacuous.

`D2.6`'s whole claim rests on this predicate being an AND-of-presence, not a single flag that
happens to default to `True`. Every one of the 8 combinations of the three booleans is checked
below so that "quarantined" cannot silently collapse into "always true" or "always false".
"""

from __future__ import annotations

import itertools

import pytest

from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    coinalyze_open_interest_key,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.quarantine_terms import (
    COINALYZE_ONE_SHOT_TERMS,
    QuarantineTerms,
    quarantine_gaveta,
    quarantine_terms_for_catalog_entry,
    readable_by_backtest,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import Reduction


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


def _coinalyze_close_entry() -> SeriesCatalogEntry:
    """Return the PRODUCTION catalog row for the Coinalyze OI close — `D6.2`'s falsifier subject.

    `T-06.5` (`open_interest_catalog.py`, merged into `master` while this task was in
    progress) populates the real five rows: `unit="BTC"` and `label_shift=300_000` are not
    invented here — they come straight from `coinalyze_open_interest_key`, the same function
    production code calls. Building a private fixture with a guessed `label_shift` would risk
    exactly the drift this repo's own `T-06.1` doc delta warns against ("o teste lê o
    catálogo, não duplica valor") — an earlier draft of this test did guess `label_shift=0`,
    and this real row proves that guess wrong.
    """
    catalog = open_interest_catalog_entries()
    entry = catalog.entry_for(coinalyze_open_interest_key(Reduction.CLOSE))
    assert entry is not None, "open_interest_catalog_entries() dropped the CLOSE row"
    return entry


def _binance_point_entry() -> SeriesCatalogEntry:
    """Return the PRODUCTION catalog row for the Binance OI point — the "other" real series.

    Used only to prove the gaveta is not the WHOLE catalog (`D6.1`'s mixed-catalog tests):
    it shares nothing with the Coinalyze row above except both being real `T-06.5` output.
    """
    catalog = open_interest_catalog_entries()
    entry = catalog.entry_for(binance_open_interest_key())
    assert entry is not None, "open_interest_catalog_entries() dropped the Binance POINT row"
    return entry


def test_quarantine_terms_for_catalog_entry_derives_the_first_two_terms_from_the_key() -> None:
    """`label_shift_present`/`unit_present` come from `entry.key`, not from a hardcoded `True`."""
    entry = _coinalyze_close_entry()

    terms = quarantine_terms_for_catalog_entry(entry, available_at_present=False)

    assert terms.label_shift_present is True
    assert terms.unit_present is True
    assert terms.available_at_present is False
    assert terms.is_quarantined is True
    assert terms.open_terms == ("available_at",)


def test_d6_2_the_third_term_alone_isolates_a_series_with_the_other_two_resolved() -> None:
    """`D6.2` — THE FALSIFIER OF THE PHASE, over a REAL Coinalyze-shaped catalog row.

    `label_shift` and `unit` are BOTH present on this entry (the measurement `SPEC-001` §5.2
    cites) and `available_at_present=False` is the one term `Q19` has not resolved for
    Coinalyze specifically. If a three-term predicate opened here, it would be a two-term
    predicate wearing the third term's name — this assertion is what `D6.2` asks to see fail.
    """
    entry = _coinalyze_close_entry()

    terms = quarantine_terms_for_catalog_entry(entry, available_at_present=False)

    assert terms.is_quarantined is True, (
        "a series with label_shift AND unit present must still be quarantined when "
        "available_at is the only absent term — D6.2's falsifier"
    )


def test_d6_1_gaveta_count_matches_the_predicate_applied_by_hand_over_the_whole_catalog() -> None:
    """`D6.1`: `count(gaveta) == count(catálogo WHERE <predicado>)`, over the REAL catalog.

    `open_interest_catalog_entries()` (`T-06.5`) is five real rows: four Coinalyze
    (`OPEN`/`HIGH`/`LOW`/`CLOSE`) and one Binance (`POINT`). Only the Binance row is marked
    resolved here — the four Coinalyze rows are deliberately ABSENT from `availability`,
    because `D6.1`'s own invariant is that silence quarantines a series, not that it exempts
    it.
    """
    catalog = open_interest_catalog_entries()
    binance_entry = _binance_point_entry()
    availability = {binance_entry.key.series_key_id(): True}

    gaveta = quarantine_gaveta(catalog, available_at_present_by_key=availability)
    predicate_count = sum(
        1
        for entry in catalog.entries
        if quarantine_terms_for_catalog_entry(
            entry, available_at_present=availability.get(entry.key.series_key_id(), False)
        ).is_quarantined
    )
    coinalyze_ids = frozenset(
        entry.key.series_key_id() for entry in catalog.entries if entry.key.provider == "coinalyze"
    )

    assert len(catalog.entries) == 5
    assert len(coinalyze_ids) == 4
    assert len(gaveta) == predicate_count == 4
    assert gaveta == coinalyze_ids


def test_d6_1_readable_by_backtest_never_intersects_the_gaveta() -> None:
    """`D6.1`'s second invariant: `count(painéis sincronizados ∩ quarentena) == 0`."""
    catalog = open_interest_catalog_entries()
    binance_entry = _binance_point_entry()
    availability = {binance_entry.key.series_key_id(): True}

    gaveta = quarantine_gaveta(catalog, available_at_present_by_key=availability)
    readable = readable_by_backtest(catalog, available_at_present_by_key=availability)

    assert readable == frozenset({binance_entry.key.series_key_id()})
    assert readable & gaveta == frozenset()


def test_readable_by_backtest_is_not_vacuously_empty() -> None:
    """The other half of the falsifier: a catalog with NOTHING quarantined reads back whole.

    Without this, `readable_by_backtest` returning only the Binance row above would be
    indistinguishable from "the function always drops everything but one row" — this proves
    it returns the FULL catalog when every entry has all three terms resolved.
    """
    catalog = open_interest_catalog_entries()
    availability = {entry.key.series_key_id(): True for entry in catalog.entries}

    readable = readable_by_backtest(catalog, available_at_present_by_key=availability)

    assert readable == frozenset(entry.key.series_key_id() for entry in catalog.entries)
    assert len(readable) == 5
