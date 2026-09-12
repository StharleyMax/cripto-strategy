"""`ADR-037/D3`'s falsifier: `(native_grid, native_grid_ms)` never diverges on a SERVED row.

`ADR-037/D3` declares the millisecond width beside the label instead of parsing the label, and
names the risk of that form out loud: *"nada impede alguem declarar `("5min", 60_000)`. O que
fecha e um teste que enumera TODAS as entradas servidas e exige que o par venha de uma tabela
declarada unica"*.

This module is that test. `_DECLARED_GRID_WIDTHS` is the single declared table, and it is a
DECLARATION, not a parser: it does not decide *which instants exist in a window* — that is
`charts`' canonical grid (`ADR-003`/FR-3), which this file never touches and never reimplements.
It only refuses two spellings of the same fact that disagree.

The universe is every row `GET /api/v1/series-catalog` actually serves (`list_pilot_series_catalog`,
the catalog `src.main.create_app` wires), never a hand-written list of entry builders — a builder
added tomorrow and wired into the served catalog is inside this test's universe the day it is
wired, with nothing to remember to update here.
"""

from __future__ import annotations

from typing import Final

import pytest

from src.modules.sentimento.use_cases.series_catalog import (
    list_pilot_series_catalog,
    list_series_catalog,
)

_DECLARED_GRID_WIDTHS: Final[dict[str, int]] = {
    "1min": 60_000,
    "5min": 300_000,
}
"""The ONE table `ADR-037/D3` asks for: every `native_grid` label a served row may carry, with
the millisecond width that label means. A label absent from here reaching a served row fails
`test_every_served_label_is_in_the_declared_table` — deliberately, because an unlisted label is
exactly the case where a divergent `native_grid_ms` could not be caught."""


def _served_catalogs() -> list[tuple[str, object]]:
    return [
        ("list_pilot_series_catalog", list_pilot_series_catalog()),
        ("list_series_catalog", list_series_catalog()),
    ]


@pytest.mark.parametrize("builder", ["list_pilot_series_catalog", "list_series_catalog"])
def test_every_served_label_is_in_the_declared_table(builder: str) -> None:
    """No served row carries a grid label the single declared table does not name."""
    catalog = dict(_served_catalogs())[builder]
    labels = {entry.native_grid for entry in catalog.entries}  # type: ignore[attr-defined]
    assert labels, f"{builder} served zero rows: an empty universe proves nothing (ADR-012)"
    assert labels <= set(_DECLARED_GRID_WIDTHS), (
        f"{builder} serves grid labels absent from _DECLARED_GRID_WIDTHS: "
        f"{sorted(labels - set(_DECLARED_GRID_WIDTHS))}"
    )


@pytest.mark.parametrize("builder", ["list_pilot_series_catalog", "list_series_catalog"])
def test_no_served_row_declares_a_width_that_contradicts_its_label(builder: str) -> None:
    """The pair `(native_grid, native_grid_ms)` agrees with the declared table on EVERY row.

    This is the whole falsifier of `ADR-037/D3`'s "declare it, do not parse it" form: the two
    fields can only drift silently if nothing enumerates them together.
    """
    catalog = dict(_served_catalogs())[builder]
    divergent = [
        (entry.key.series_key_id(), entry.native_grid, entry.native_grid_ms)
        for entry in catalog.entries  # type: ignore[attr-defined]
        if entry.native_grid_ms != _DECLARED_GRID_WIDTHS[entry.native_grid]
    ]
    assert divergent == [], f"{builder} has rows whose label and width disagree: {divergent}"


def test_the_served_catalog_is_not_empty_and_carries_both_widths() -> None:
    """MORDE, not just CALA: the universe really contains a 5-minute row, not only 1-minute ones.

    A test that only ever saw `1min` rows would pass while `ADR-037`'s entire defect class —
    a native grid WIDER than the report step — stayed unmeasured. `ADR-037`/M4 counted the
    served catalog as 16 rows of `1min` plus 28 of `5min`; this pins that both cells are still
    populated, without pinning the two counts, which a new instrument legitimately moves.
    """
    widths = {entry.native_grid_ms for entry in list_pilot_series_catalog().entries}
    assert widths == {60_000, 300_000}
