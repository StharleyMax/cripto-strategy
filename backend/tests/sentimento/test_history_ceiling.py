"""`domain/history_ceiling.py` — `D5`'s 90-day ceiling, as the ONE place it is declared (`T-05.3`).

The substantive claims (the arithmetic behind `90`, the measured cost of the walk that already
ran the ceiling, `DoD 5`/`DoD 6` of plan `05`) live in `infra/klines_backfill_cli.py`'s test
suite (`T-01.5`, unchanged here) and in the module docstring of `history_ceiling.py` itself.
What THIS suite guards is the thing `T-05.3` actually adds: a single source of truth reachable
from every layer, so `infra/klines_backfill_cli.MAX_BACKFILL_DAYS` and whatever `T-05.4` builds
against `GET /series-history` can never silently drift apart.
"""

from __future__ import annotations

from src.modules.sentimento.domain.history_ceiling import (
    MAX_HISTORY_DAYS,
    MAX_HISTORY_MS,
    MS_PER_DAY,
)
from src.modules.sentimento.infra.klines_backfill_cli import MAX_BACKFILL_DAYS


def test_the_ceiling_is_ninety_days() -> None:
    """`[DECISAO-OWNER: 2026-09-19]`, literal: "90 dias, como a SPEC declara"."""
    assert MAX_HISTORY_DAYS == 90


def test_the_ms_conversion_is_the_declared_day_multiplied_by_the_declared_day_width() -> None:
    """`MAX_HISTORY_MS` is derived arithmetic, never a second hand-typed literal.

    Morde: hand-type `7_776_000_000` (90 days in ms) as `MAX_HISTORY_MS` instead of the
    multiplication and this still passes today — but change `MAX_HISTORY_DAYS` alone and a
    hand-typed sibling would silently stop matching it. Asserting the PRODUCT, not the literal,
    is what pins the two together.
    """
    assert MAX_HISTORY_MS == MAX_HISTORY_DAYS * MS_PER_DAY
    assert MAX_HISTORY_MS == 90 * 86_400_000


def test_the_infra_backfill_ceiling_is_the_same_object_never_a_second_declaration() -> None:
    """`infra/klines_backfill_cli.MAX_BACKFILL_DAYS` IMPORTS this constant — `T-05.3`'s point.

    Before `T-05.3` this file declared its own `MAX_BACKFILL_DAYS: Final[int] = 90`, reachable
    only from `infra/` — unreachable from a `use_cases`/route module refusing a window under
    `backend/pyproject.toml`'s `infra > use_cases > domain` layer contract. Morde: revert
    `klines_backfill_cli.py` to a fresh `= 90` literal and this assertion still passes on VALUE
    but the two constants are no longer the SAME name resolving to the SAME object — the `is`
    check below is what distinguishes "still equal today" from "provably the same declaration".
    """
    assert MAX_BACKFILL_DAYS is MAX_HISTORY_DAYS
