"""`HistogramRecipe` — `ADR-020/D6`: the bundle carries the RECIPE, no axis has a default."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.histogram_recipe import (
    CURRENT_HISTOGRAM_RECIPE_VERSION,
    DEFAULT_HISTOGRAM_RECIPE,
    HistogramRecipe,
    Interpolation,
    InvalidHistogramRecipeError,
)


def test_default_recipe_is_valid_and_declared() -> None:
    """`DEFAULT_HISTOGRAM_RECIPE` is a legal recipe, and it is the `[1, 99]` the ADR names."""
    assert DEFAULT_HISTOGRAM_RECIPE.quantiles == (1.0, 99.0)
    assert DEFAULT_HISTOGRAM_RECIPE.spec_version == CURRENT_HISTOGRAM_RECIPE_VERSION


def test_non_positive_spec_version_is_refused() -> None:
    """`spec_version <= 0` refuses."""
    with pytest.raises(InvalidHistogramRecipeError, match="spec_version"):
        HistogramRecipe(
            spec_version=0,
            quantiles=(1.0, 99.0),
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=0.01,
        )


def test_fewer_than_two_quantiles_is_refused() -> None:
    """`ADR-020/D2` step 4 needs at least 2 edges to produce a finite bin."""
    with pytest.raises(InvalidHistogramRecipeError, match="quantiles"):
        HistogramRecipe(
            spec_version=1,
            quantiles=(50.0,),
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=0.01,
        )


@pytest.mark.parametrize("bad_quantiles", [(0.0, 99.0), (1.0, 100.0), (-1.0, 99.0)])
def test_quantile_outside_open_interval_is_refused(bad_quantiles: tuple[float, float]) -> None:
    """Every quantile must satisfy `0 < q < 100`."""
    with pytest.raises(InvalidHistogramRecipeError, match="0 < q < 100"):
        HistogramRecipe(
            spec_version=1,
            quantiles=bad_quantiles,
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=0.01,
        )


def test_non_increasing_quantiles_are_refused() -> None:
    """`(q_1 < … < q_k)` is strict — a tie or a descent refuses."""
    with pytest.raises(InvalidHistogramRecipeError, match="strictly increasing"):
        HistogramRecipe(
            spec_version=1,
            quantiles=(50.0, 50.0),
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=0.01,
        )


@pytest.mark.parametrize("bad_share", [0.0, -0.1, 1.5])
def test_point_mass_min_share_outside_zero_one_is_refused(bad_share: float) -> None:
    """`point_mass_min_share` must satisfy `0 < share <= 1`."""
    with pytest.raises(InvalidHistogramRecipeError, match="point_mass_min_share"):
        HistogramRecipe(
            spec_version=1,
            quantiles=(1.0, 99.0),
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=bad_share,
        )


def test_point_mass_min_share_of_exactly_one_is_legal() -> None:
    """The upper bound is inclusive: `share = 1` is legal SHAPE.

    Every observation being the point mass, even if it is an unusual recipe to choose.
    """
    recipe = HistogramRecipe(
        spec_version=1,
        quantiles=(1.0, 99.0),
        interpolation=Interpolation.LINEAR,
        point_mass_min_share=1.0,
    )
    assert recipe.point_mass_min_share == 1.0
