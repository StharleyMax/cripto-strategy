"""`HistogramRecipe` — what the versioned bundle carries: the RECIPE, never a frozen edge.

`ADR-020/D6`: bin edges are NOT frozen into the bundle. `SPEC-001` §7 already fixes
`reproduzir(run) = (bundle_hash, window, knowledge_time)`, and `derive_edges` (`ADR-020/D2`) is
a PURE function of `(field, nature, universe, window, knowledge_time, recipe)` — pinning
`knowledge_time` already makes the underlying read deterministic, so re-running the recipe over
the same three axes has to reproduce the same edges, always (`D8.9`'s own falsifier: "roda de
novo com o mesmo bundle e a mesma janela -> IDENTICO, OU RECUSA"). Freezing numbers here would
be a SECOND reproducibility mechanism competing with the one `SPEC-001` §7 already declares
global. The operator never types a bin edge — only the recipe.

The three axes below are `[OPINIÃO: quant-architect, 2026-09-04]` per `ADR-020`'s own closing
section: a domain-judgment choice of what the recipe's shape IS, not a measurement. What IS
measured, and is not opinion: fixed bin edges break (`D8.6`), percentile without a declared
estimator lies (`SPEC-001:305`), and point mass exists and moves `p90`/`p99` (`D8.7`).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Final

#: Bundle format version — the analogue of `CURRENT_THRESHOLD_SPEC_VERSION` in
#: `frontend/src/app/threshold-spec-bundle.ts`, for the SAME reason: `decodeBundle` there
#: refuses an unsupported version rather than guessing a mapping. The Python side does not own
#: bundle decoding (that stays a `web`/frontend concern per `ADR-020/D7`); this constant exists
#: so `HistogramRecipe.spec_version` has one canonical "current" value to validate against.
CURRENT_HISTOGRAM_RECIPE_VERSION: Final[int] = 1


class Interpolation(Enum):
    """`numpy.percentile`'s own `interpolation` parameter values.

    The SAME five members as `Interpolation` in `frontend/src/app/threshold-spec-bundle.ts:55`
    — reused as VOCABULARY (`ADR-020/D2` step 3 cites that TS module by name), not by import:
    Python and TypeScript do not share a module system, so this is the Python-side mirror of
    the same closed set, not a second invention. `SPEC-001:305`: "percentil sem estimador
    mente" — the estimator is a required, declared axis of the recipe, never inferred from
    whichever default the underlying percentile routine happens to ship with.
    """

    LINEAR = "linear"
    LOWER = "lower"
    HIGHER = "higher"
    NEAREST = "nearest"
    MIDPOINT = "midpoint"


class InvalidHistogramRecipeError(Exception):
    """A `HistogramRecipe` axis outside its declared bound — no axis defaults (`ADR-020/D6`)."""


@dataclass(frozen=True)
class HistogramRecipe:
    """The versioned recipe: `{specVersion, quantiles, interpolation, pointMassMinShare}`.

    `ADR-020/D6`, literal. `quantiles` is `(q_1 < … < q_k) ⊂ (0,100)`, strictly increasing —
    `ADR-020/D2` step 4 builds `k-1` finite bins from `k` edges plus the two overflow bins, so
    fewer than two quantiles would leave zero finite bins, which is legal in SHAPE but is
    refused here because a recipe that produces zero finite bins by construction is not what
    any caller means to ask for; a future task that wants a "single split" recipe can lower
    this floor on purpose, in the open, rather than inherit it from an omitted check.
    """

    spec_version: int
    quantiles: tuple[float, ...]
    interpolation: Interpolation
    point_mass_min_share: float

    def __post_init__(self) -> None:
        """Refuse an invalid axis.

        Non-positive version, malformed quantiles, or an out-of-range point-mass share.
        """
        if self.spec_version <= 0:
            raise InvalidHistogramRecipeError(
                f"spec_version must be a positive integer, got {self.spec_version!r}"
            )
        if len(self.quantiles) < 2:
            raise InvalidHistogramRecipeError(
                f"quantiles must have at least 2 entries to produce at least one finite bin "
                f"(ADR-020/D2 step 4), got {self.quantiles!r}"
            )
        for q in self.quantiles:
            if q <= 0.0 or q >= 100.0:
                raise InvalidHistogramRecipeError(
                    f"every quantile must satisfy 0 < q < 100, got {q!r} in {self.quantiles!r}"
                )
        for previous, current in zip(self.quantiles, self.quantiles[1:], strict=False):
            if previous >= current:
                raise InvalidHistogramRecipeError(
                    f"quantiles must be strictly increasing, got {self.quantiles!r}"
                )
        if self.point_mass_min_share <= 0.0 or self.point_mass_min_share > 1.0:
            raise InvalidHistogramRecipeError(
                f"point_mass_min_share must satisfy 0 < share <= 1, got "
                f"{self.point_mass_min_share!r}"
            )


#: A declared default — `ADR-020`'s own falsifier names it explicitly as an acceptable choice
#: ("recipe.quantiles = [1, 99] (ou o que a implementação escolher como default, DECLARADO)").
#: `point_mass_min_share = 0.01` is chosen so it catches the DOMINANT point mass `D8.7` measured
#: (`0,0001` in 665 of 873 symbols, share ≈ 0,76) while staying far below it — this default is
#: `[OPINIÃO: quant-architect via builder, 2026-09-04]`, not a second measurement; a caller with
#: a different domain judgment builds its own `HistogramRecipe` instead of using this one.
DEFAULT_HISTOGRAM_RECIPE: Final[HistogramRecipe] = HistogramRecipe(
    spec_version=CURRENT_HISTOGRAM_RECIPE_VERSION,
    quantiles=(1.0, 99.0),
    interpolation=Interpolation.LINEAR,
    point_mass_min_share=0.01,
)
