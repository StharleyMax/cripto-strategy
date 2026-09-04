"""`ThresholdSpec` — the Python mirror of `threshold-spec-bundle.ts`, pinned field-for-field."""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.threshold_spec import (
    OPERATORS,
    AbsoluteSpec,
    InvalidThresholdSpecError,
    PercentileSpec,
    RobustZSpec,
)

# ── transcribed BY HAND from `frontend/src/app/threshold-spec-bundle.ts`, on purpose ────────
#
# Same defence `test_ingest_health_query.py` uses for `ADR_008_D3_RUN_COLUMNS`: comparing a
# transcription against ITSELF would let the two sides drift together. `AbsoluteSpec`'s own
# `dataclasses.fields()` is compared against this tuple, so a field renamed on either side of
# the language boundary fails HERE, not silently in a caller that assumes they still match.
TS_ABSOLUTE_FIELDS = ("pct", "op")
TS_PERCENTILE_FIELDS = ("q", "window", "scope", "min_obs", "interpolation", "op")
TS_ROBUST_Z_FIELDS = ("k", "window", "min_obs", "op")


def _field_names(cls: type) -> tuple[str, ...]:
    """Return the dataclass field names of `cls`, in declaration order."""
    return tuple(f.name for f in dataclasses.fields(cls))


def test_absolute_spec_fields_match_the_typescript_transcription() -> None:
    """`AbsoluteSpec` carries exactly `{pct, op}`, same order as the TS side."""
    assert _field_names(AbsoluteSpec) == TS_ABSOLUTE_FIELDS


def test_percentile_spec_fields_match_the_typescript_transcription() -> None:
    """`PercentileSpec` carries exactly `{q, window, scope, min_obs, interpolation, op}`."""
    assert _field_names(PercentileSpec) == TS_PERCENTILE_FIELDS


def test_robust_z_spec_fields_match_the_typescript_transcription() -> None:
    """`RobustZSpec` carries exactly `{k, window, min_obs, op}`."""
    assert _field_names(RobustZSpec) == TS_ROBUST_Z_FIELDS


def test_operators_are_the_closed_four_symbol_set() -> None:
    """The same 4 operators `threshold-spec-bundle.ts:46` declares."""
    assert OPERATORS == (">", ">=", "<", "<=")


# ── `AbsoluteSpec` ───────────────────────────────────────────────────────────────────────


def test_absolute_spec_accepts_a_finite_pct() -> None:
    """A finite `pct` with a legal `op` constructs without complaint."""
    spec = AbsoluteSpec(pct=5.0, op=">")
    assert spec.pct == 5.0


def test_absolute_spec_refuses_a_bad_operator() -> None:
    """An `op` outside the closed set refuses."""
    with pytest.raises(InvalidThresholdSpecError, match="op"):
        AbsoluteSpec(pct=5.0, op="==")  # type: ignore[arg-type]


def test_absolute_spec_refuses_a_non_finite_pct() -> None:
    """`pct = inf` refuses.

    `SPEC-001:303`'s "sem default em nenhum eixo" extends to sane VALUES, not merely presence.
    """
    with pytest.raises(InvalidThresholdSpecError, match="pct"):
        AbsoluteSpec(pct=float("inf"), op=">")


# ── `PercentileSpec` ─────────────────────────────────────────────────────────────────────


def test_percentile_spec_refuses_q_outside_open_interval() -> None:
    """`q` must satisfy `0 < q < 100`, same bound as `assertValidThresholdSpec`."""
    with pytest.raises(InvalidThresholdSpecError, match="0 < q < 100"):
        PercentileSpec(
            q=100.0,
            window=2016,
            scope="CrossSection",
            min_obs=576,
            interpolation=Interpolation.LINEAR,
            op=">",
        )


def test_percentile_spec_refuses_min_obs_over_window() -> None:
    """`SPEC-001:304`'s own example: `rolling(2016, min_periods=576)` legal; the inverse is not.

    `min_obs > window` refuses — this is the SHAPE-time half of the rule; the RUNTIME half
    (population smaller than `min_obs` at scan time) is `scan.MinObsNotMetError`.
    """
    with pytest.raises(InvalidThresholdSpecError, match="min_obs"):
        PercentileSpec(
            q=90.0,
            window=100,
            scope="CrossSection",
            min_obs=576,
            interpolation=Interpolation.LINEAR,
            op=">",
        )


def test_percentile_spec_refuses_an_empty_scope() -> None:
    """`scope` is a required, non-empty string — never defaulted to `"CrossSection"`."""
    with pytest.raises(InvalidThresholdSpecError, match="scope"):
        PercentileSpec(
            q=90.0,
            window=2016,
            scope="   ",
            min_obs=576,
            interpolation=Interpolation.LINEAR,
            op=">",
        )


def test_percentile_spec_refuses_a_non_positive_window() -> None:
    """`window <= 0` refuses — a window has to hold at least one point."""
    with pytest.raises(InvalidThresholdSpecError, match="window"):
        PercentileSpec(
            q=90.0,
            window=0,
            scope="CrossSection",
            min_obs=1,
            interpolation=Interpolation.LINEAR,
            op=">",
        )


def test_percentile_spec_refuses_a_non_positive_min_obs() -> None:
    """`min_obs <= 0` refuses — zero observations required is not a floor."""
    with pytest.raises(InvalidThresholdSpecError, match="min_obs"):
        PercentileSpec(
            q=90.0,
            window=100,
            scope="CrossSection",
            min_obs=0,
            interpolation=Interpolation.LINEAR,
            op=">",
        )


# ── `RobustZSpec` ────────────────────────────────────────────────────────────────────────


def test_robust_z_spec_refuses_non_positive_k() -> None:
    """`k` must be `> 0` — a zero or negative multiple of the robust scale is not a threshold."""
    with pytest.raises(InvalidThresholdSpecError, match="k"):
        RobustZSpec(k=0.0, window=100, min_obs=30, op=">")


def test_robust_z_spec_refuses_min_obs_over_window() -> None:
    """Same shape-time rule as `PercentileSpec`."""
    with pytest.raises(InvalidThresholdSpecError, match="min_obs"):
        RobustZSpec(k=3.0, window=50, min_obs=576, op=">")


def test_robust_z_spec_refuses_a_non_positive_window() -> None:
    """`window <= 0` refuses, same shape-time rule as `PercentileSpec`."""
    with pytest.raises(InvalidThresholdSpecError, match="window"):
        RobustZSpec(k=3.0, window=0, min_obs=1, op=">")


def test_robust_z_spec_refuses_a_non_positive_min_obs() -> None:
    """`min_obs <= 0` refuses, same shape-time rule as `PercentileSpec`."""
    with pytest.raises(InvalidThresholdSpecError, match="min_obs"):
        RobustZSpec(k=3.0, window=100, min_obs=0, op=">")
