"""The quarantine predicate — three terms, `SPEC-001` §5.2, quoted verbatim below."""

#     QUARENTENA  <=>  label_shift IS NULL  OR  unit IS NULL  OR  available_at IS NULL
#
# `T-02.2` (below, `COINALYZE_ONE_SHOT_TERMS`) is the predicate applied by HAND, once, to one
# source. `T-06.6` is this module's actual task: the predicate generalized so it runs over
# `series_catalog.SeriesCatalog` (`T-06.1`) as a whole, which is what `D6.1`'s "sobre TODO O
# CATÁLOGO" universe requires and what `T-06.7`/`T-06.8` (both `depends_on = ["T-06.6"]`) need
# to call without re-deriving the three terms themselves.
#
# ── WHY `label_shift_present`/`unit_present` ARE ALWAYS `True` FOR A CATALOG ROW ──────
#
# `series_key.py`'s `SeriesKey.label_shift` is a required `int` and `SeriesKey.unit` is a
# required non-blank `str` — `__post_init__` refuses a blank string term, and there is no
# `None` a dataclass field typed `int`/`str` can hold. So a `SeriesCatalogEntry` (one row per
# `SeriesKey`, `series_catalog.py`) CANNOT be constructed with either term missing: by the time
# a series has a catalog row at all, the first two terms of `SPEC-001` §5.2's predicate are
# already settled. This is not this module inventing a shortcut — it is `SPEC-001` §5.2 itself,
# read against the type `T-06.1` already built: "A Coinalyze continua isolada, e agora pelo
# termo NOMEADO" (the third one) is the SPEC's own words for exactly this collapse.
#
# `available_at_present` is the one term catalog membership does NOT settle, because it is not
# a term of `SeriesKey` at all — `SPEC-001` §2.2 places it in the availability lag table
# (`domain/availability_lag_stats.py`'s `LagSummaryRow`, keyed by `(endpoint, observer_region)`,
# `Q19`/`T-03.6`), a measurement independent of the catalog row. So it arrives as a parameter
# to every function below, never read off `entry`.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry


@dataclass(frozen=True)
class QuarantineTerms:
    """The three presence bits `SPEC-001` §5.2 ORs together — one field per term, none implicit.

    `is_quarantined` is a De Morgan flip of the spec's `OR of NULL`s into `AND of present`s:
    a row is NOT quarantined only when all three terms are present, so anything else — one
    absent, two absent, all three absent — quarantines it. This is the "predicado de três
    termos" the handoff warns is not a naive boolean: it is three independent facts, not one.
    """

    label_shift_present: bool
    unit_present: bool
    available_at_present: bool

    @property
    def is_quarantined(self) -> bool:
        """Return whether this row is quarantined under the three-term predicate."""
        return not (self.label_shift_present and self.unit_present and self.available_at_present)

    @property
    def open_terms(self) -> tuple[str, ...]:
        """Name every term that is absent — the falsifier's own explanation of its verdict."""
        missing = []
        if not self.label_shift_present:
            missing.append("label_shift")
        if not self.unit_present:
            missing.append("unit")
        if not self.available_at_present:
            missing.append("available_at")
        return tuple(missing)


# `SPEC-001` §5.2, literal: "A medição resolveu `unit`… e `label_shift`… Não resolveu
# `available_at IS NULL`". Every row this one-shot writes carries these two terms present and
# the third absent — `Q19` is the only thing that can flip it, and `Q19` is not this task.
COINALYZE_ONE_SHOT_TERMS: Final[QuarantineTerms] = QuarantineTerms(
    label_shift_present=True,
    unit_present=True,
    available_at_present=False,
)


def quarantine_terms_for_catalog_entry(
    entry: SeriesCatalogEntry, *, available_at_present: bool
) -> QuarantineTerms:
    """Compute the three-term predicate for ANY row of `series_catalog` — general, `D6.1`.

    `label_shift_present` and `unit_present` are derived from `entry.key`, not hardcoded to
    `True`: `entry.key.label_shift` is read as `int` (a `SeriesKey` cannot hold anything else)
    and `entry.key.unit` is checked non-blank the same way `SeriesKey.__post_init__` already
    does. This keeps the derivation visible and re-checkable rather than asserting the two
    terms by comment alone — if `series_key.py` ever grows an optional `label_shift`/`unit`,
    this function is the one place that would need to change, not every caller of it.

    `available_at_present` is NOT derivable from `entry` (see the module docstring) and is
    always the caller's answer — typically `quarantine_drawer`'s own
    `available_at_present_by_key` argument, resolved from the availability lag table
    (`Q19`/`T-03.6`).
    """
    return QuarantineTerms(
        label_shift_present=isinstance(entry.key.label_shift, int),
        unit_present=bool(entry.key.unit.strip()),
        available_at_present=available_at_present,
    )


def quarantine_drawer(
    catalog: SeriesCatalog, *, available_at_present_by_key: Mapping[str, bool]
) -> frozenset[str]:
    """Return every `series_key_id` quarantined under the three-term predicate — `D6.1`.

    `available_at_present_by_key` maps `series_key_id` to whether the availability lag table
    has resolved `available_at` for that series. A `series_key_id` ABSENT from the mapping is
    treated as UNRESOLVED (`available_at_present=False`) — the same "silence is not `ok`" rule
    `availability_lag_stats.py`'s `LagSummaryRow` already applies (a key with zero transitions
    still gets a row, `lag_n=0`, rather than vanishing): a series nobody has measured yet must
    not be silently promoted to trust by falling off this mapping.

    `D6.1`'s first invariant, literal — `count(gaveta) == count(catálogo WHERE <predicado>)` —
    is true of this function BY CONSTRUCTION (it is a filter over exactly that predicate), which is
    why the falsifying test for this DoD plants a real Coinalyze-shaped entry and checks the
    VERDICT rather than re-deriving the count a second way.
    """
    return frozenset(
        entry.key.series_key_id()
        for entry in catalog.entries
        if quarantine_terms_for_catalog_entry(
            entry,
            available_at_present=available_at_present_by_key.get(entry.key.series_key_id(), False),
        ).is_quarantined
    )


def readable_by_backtest(
    catalog: SeriesCatalog, *, available_at_present_by_key: Mapping[str, bool]
) -> frozenset[str]:
    """Return exactly the `series_key_id`s a `backtest` reader may see — `D6.1`'s second half.

    The handoff for this task is explicit about the boundary: "esta task decide QUAIS séries a
    leitura de backtest pode ver; não reimplemente o acessor `as_of` em si." This function is
    that decision and nothing more — `T-04.4`'s decision-read module still owns HOW a decision
    read walks the rows of a series that IS readable; this only names the set.

    It is the set-complement of `quarantine_drawer` over the SAME catalog and the SAME
    availability mapping, so `readable_by_backtest(...) & quarantine_drawer(...) == frozenset()`
    holds by construction — `D6.1`'s "`count(painéis sincronizados ∩ quarentena) == 0`" made
    executable, over the whole catalog rather than one series at a time.
    """
    drawer = quarantine_drawer(catalog, available_at_present_by_key=available_at_present_by_key)
    all_keys = frozenset(entry.key.series_key_id() for entry in catalog.entries)
    return all_keys - drawer
