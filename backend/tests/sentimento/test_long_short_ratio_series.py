"""`D6.4`/`D6.5`/`D6.6`: the four L/S series, `delta()` typed away from the taker leg, no lying.

`SPEC-001` §3.1/§5.11, `CA-F2-3`, plan `06` items 6.3+6.10 (`T-06.3`/`CST-47`).
Comando: `bash backend/scripts/test.sh -k test_long_short_ratio_series`, sobre
`data/binance/metrics/btcusdt/2026-08-{17..23}.csv` e
`data/binance/metrics/alts/{COTI,DOGE,SLX}USDT-metrics-2026-08-{17..23}.csv`
(catalogadas em `data/MANIFEST.md`).
"""

from __future__ import annotations

import ast
import inspect
import math
from dataclasses import fields
from decimal import Decimal
from pathlib import Path
from typing import get_args

import pytest

from src.modules.sentimento.domain.long_short_ratio_series import (
    COUNT_LONG_SHORT_RATIO,
    COUNT_TOPTRADER_LONG_SHORT_RATIO,
    LONG_SHORT_METRICS,
    POSITION_RATIO_METRICS,
    SUM_TAKER_LONG_SHORT_VOL_RATIO,
    SUM_TOPTRADER_LONG_SHORT_RATIO,
    InvalidTakerVolumeError,
    MismatchedRatioMetricError,
    NonAggregableFlowRatioError,
    PositionRatioMetric,
    PositionRatioObservation,
    TakerRatioComponents,
    delta,
    resample_bare_taker_ratio_refuses,
    resample_position_ratio_to_timeframe,
    resample_taker_ratio_to_timeframe,
)
from src.modules.sentimento.domain.metrics_shift import RawMetricsRow
from src.modules.sentimento.infra.metrics_csv_reader import read_raw_metrics_rows
from tests.helpers.data_fixtures import require_fixture

# ═══════════════════════════════════════════════════════════════════════════════════════════
# D6.4 — autocorrelation lag-1 on this repo's own fixtures, 4 symbols
# ═══════════════════════════════════════════════════════════════════════════════════════════
#
# Numbers below are MEASURED BY THIS TEST on `data/binance/metrics/{btcusdt,alts}` — a
# different 7-day window (2026-08-17..23) than the SPEC's own corpus, so the exact digits are
# not expected to reproduce bit-for-bit (the same posture `test_taker_lookahead_regression.py`
# already takes for this data family). What the DoD's falsifier requires reproduces exactly:
# three series at 0,99+ autocorrelation, one near zero, and |r| < 0,10 in 12 of 12 cross-pairs.

_BTC_FILES: tuple[tuple[str, str], ...] = (
    ("binance/metrics/btcusdt/2026-08-17.csv", "69e9c6985424f698ee1e638abcbeaa8c"),
    ("binance/metrics/btcusdt/2026-08-18.csv", "b8ef79c353f2adce853c68084cc3b631"),
    ("binance/metrics/btcusdt/2026-08-19.csv", "217f2b058ca316f409704b3d01ae7ddf"),
    ("binance/metrics/btcusdt/2026-08-20.csv", "1c3763d92d7d376d1f96b8cf5a77127a"),
    ("binance/metrics/btcusdt/2026-08-21.csv", "9d642820a446baf24cd53b88bb48fffc"),
    ("binance/metrics/btcusdt/2026-08-22.csv", "16479131da4ef898f62036e6737a50a5"),
    ("binance/metrics/btcusdt/2026-08-23.csv", "fc8c0fba983194cf356a7d172b3bd39e"),
)
_COTI_FILES: tuple[tuple[str, str], ...] = (
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-17.csv", "0105a06f474f52aaa295b3febeee95db"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-18.csv", "cc68b738ad6b6cd159d503a78ad76d7d"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-19.csv", "51f162dc46eed724e42d31699841f8b2"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-20.csv", "dd081efe42481cb4e1e461a185c2e9e7"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-21.csv", "ffad64c907b9d3f575d37d12b33e6af4"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-22.csv", "7b6124961690b01480cd30cd5dfe672a"),
    ("binance/metrics/alts/COTIUSDT-metrics-2026-08-23.csv", "e2a65490e7fe952648c75e1a7b27fa2b"),
)
_DOGE_FILES: tuple[tuple[str, str], ...] = (
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-17.csv", "bb341d285334cf9ace163b8733ef6221"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-18.csv", "360e75cbe8e33b334a97de08bc910590"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-19.csv", "e6ef2821953a85864303f6008b7c7944"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-20.csv", "a16e0118367edd5f13db304e8fe02d52"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-21.csv", "57691969ebb35381fc614fd7d8c6afe8"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-22.csv", "f859c2f6890aed73f6622b2a995cc196"),
    ("binance/metrics/alts/DOGEUSDT-metrics-2026-08-23.csv", "f694caba56609f6c98fc9f41c6d3abd6"),
)
_SLX_FILES: tuple[tuple[str, str], ...] = (
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-17.csv", "d039572489599966f150a733df4e16b2"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-18.csv", "43fe2d3f510d24116836db6cc5eb245e"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-19.csv", "0292f1b5e5dcfcae8a432c22650ec71f"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-20.csv", "1809ae570002577008e6ffb0e1fa2932"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-21.csv", "9b0adde6e220101600cc52d0480b2ee0"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-22.csv", "756be7be34e5033b901e9c6e5bbf5c2f"),
    ("binance/metrics/alts/SLXUSDT-metrics-2026-08-23.csv", "dd0b7d15af2515c29281ced65f830923"),
)
_SYMBOL_FILES: dict[str, tuple[tuple[str, str], ...]] = {
    "BTCUSDT": _BTC_FILES,
    "COTIUSDT": _COTI_FILES,
    "DOGEUSDT": _DOGE_FILES,
    "SLXUSDT": _SLX_FILES,
}


def _series_by_metric(symbol: str) -> dict[str, list[float]]:
    """Return `{metric: [values in create_time order]}` for one symbol, across its 7 files."""
    rows: list[RawMetricsRow] = []
    for relative_path, expected_md5 in _SYMBOL_FILES[symbol]:
        path: Path = require_fixture(relative_path, expected_md5=expected_md5)
        rows.extend(read_raw_metrics_rows(path))
    rows.sort(key=lambda row: row.create_time_ms)
    return {
        COUNT_LONG_SHORT_RATIO: [float(row.count_long_short_ratio) for row in rows],
        COUNT_TOPTRADER_LONG_SHORT_RATIO: [
            float(row.count_toptrader_long_short_ratio) for row in rows
        ],
        SUM_TOPTRADER_LONG_SHORT_RATIO: [float(row.sum_toptrader_long_short_ratio) for row in rows],
        SUM_TAKER_LONG_SHORT_VOL_RATIO: [float(row.sum_taker_long_short_vol_ratio) for row in rows],
    }


def _autocorrelation_lag1(values: list[float]) -> float:
    """Pearson `r` between `values[:-1]` and `values[1:]` — no external dependency needed."""
    n = len(values)
    mean = sum(values) / n
    numerator = sum((values[i] - mean) * (values[i + 1] - mean) for i in range(n - 1))
    denominator = sum((value - mean) ** 2 for value in values)
    return numerator / denominator


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    return numerator / (denom_x * denom_y)


@pytest.mark.parametrize("symbol", ["BTCUSDT", "COTIUSDT", "DOGEUSDT", "SLXUSDT"])
def test_d6_4_the_three_positioning_series_have_high_lag1_autocorrelation(symbol: str) -> None:
    """`[MEDIDO]`: the three POSITIONING series sit at 0,99+ lag-1 autocorrelation."""
    series = _series_by_metric(symbol)
    for metric in POSITION_RATIO_METRICS:
        assert _autocorrelation_lag1(series[metric]) >= 0.99, metric


@pytest.mark.parametrize("symbol", ["BTCUSDT", "COTIUSDT", "DOGEUSDT", "SLXUSDT"])
def test_d6_4_the_taker_series_has_near_zero_lag1_autocorrelation(symbol: str) -> None:
    """`[MEDIDO]`: the TAKER series is white noise between buckets — nowhere near 0,99+."""
    series = _series_by_metric(symbol)
    autocorr = _autocorrelation_lag1(series[SUM_TAKER_LONG_SHORT_VOL_RATIO])
    assert abs(autocorr) < 0.10, autocorr


def test_d6_4_taker_orthogonality_is_below_0_10_in_all_12_pairs() -> None:
    """`[MEDIDO]`: `|r| < 0,10` in every one of the 4 symbols x 3 positioning metrics = 12 pairs.

    This is `CA-F2-3`'s own falsifier stated as a count: if EVEN ONE of the 12 pairs below
    crosses 0,10, the taker series is not the "outra natureza" `SPEC-001` §3.1 declares it to
    be, and the whole reason `delta()`/resample refuse it (D6.5/D6.6) stops holding.
    """
    checked = 0
    for symbol in ("BTCUSDT", "COTIUSDT", "DOGEUSDT", "SLXUSDT"):
        series = _series_by_metric(symbol)
        taker = series[SUM_TAKER_LONG_SHORT_VOL_RATIO]
        for metric in POSITION_RATIO_METRICS:
            r = _pearson(taker, series[metric])
            assert abs(r) < 0.10, (symbol, metric, r)
            checked += 1
    assert checked == 12


# ═══════════════════════════════════════════════════════════════════════════════════════════
# D6.3 — the four series have their own columns; `ls_ratio` is banned at `SeriesKey` (see
# `test_series_identity.py::test_ls_ratio_is_refused_as_a_generic_metric_name` for the identity
# side). Here: the constants this module exports name exactly the four, in `SPEC-001`'s order.
# ═══════════════════════════════════════════════════════════════════════════════════════════


def test_the_four_metrics_are_named_and_ls_ratio_is_not_one_of_them() -> None:
    """`LONG_SHORT_METRICS` names exactly the four `SPEC-001` §3.1 declares, in its order."""
    assert LONG_SHORT_METRICS == (
        "count_long_short_ratio",
        "count_toptrader_long_short_ratio",
        "sum_toptrader_long_short_ratio",
        "sum_taker_long_short_vol_ratio",
    )
    assert "ls_ratio" not in LONG_SHORT_METRICS
    assert len(LONG_SHORT_METRICS) == len(set(LONG_SHORT_METRICS)) == 4


# ═══════════════════════════════════════════════════════════════════════════════════════════
# D6.5 — `delta()` refuses the taker leg BY TYPE, not by a runtime `if`
# ═══════════════════════════════════════════════════════════════════════════════════════════
#
# `mypy --strict` proves the exclusion at the call site, MEASURED directly:
#
#   $ cd backend && .venv/bin/python -m mypy --strict <scratch file calling
#     `delta(TakerRatioComponents(buy_vol=Decimal("1"), sell_vol=Decimal("1")),
#            PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1")))`>
#   error: Argument 1 to "delta" has incompatible type "TakerRatioComponents"; expected
#   "PositionRatioObservation"  [arg-type]
#   Found 1 error in 1 file
#
# `[MEDIDO 2026-09-03]`. `bash backend/scripts/lint.sh` runs `mypy --strict` on every push; what
# THIS test proves on every run is the shape that error depends on: the `Literal` member set
# `PositionRatioMetric` excludes the taker metric FROM, `delta()`'s own signature naming the
# narrow type, and that the function body cannot spell the taker metric as a string constant.


def test_position_ratio_metric_excludes_the_taker_metric_by_member_set() -> None:
    """`PositionRatioMetric` has three members; the taker metric is not one of them."""
    assert get_args(PositionRatioMetric) == (
        "count_long_short_ratio",
        "count_toptrader_long_short_ratio",
        "sum_toptrader_long_short_ratio",
    )
    assert SUM_TAKER_LONG_SHORT_VOL_RATIO not in get_args(PositionRatioMetric)


def test_delta_signature_is_keyed_by_position_ratio_observation_only() -> None:
    """`delta()`'s own annotation names `PositionRatioObservation` on both parameters.

    That is the declared type `mypy --strict` checks every call site against, not a runtime
    `if`.
    """
    signature = inspect.signature(delta)
    before, after = signature.parameters.values()
    assert str(before.annotation) == "PositionRatioObservation"
    assert str(after.annotation) == "PositionRatioObservation"
    assert "TakerRatioComponents" not in (str(before.annotation), str(after.annotation))


def test_structural_falsifier_delta_body_cannot_spell_the_taker_metric() -> None:
    """`delta()`'s body never needs to name the taker metric.

    It only ever compares `.metric` and subtracts `.value`, both of which
    `TakerRatioComponents` does not have at all.
    """
    source = inspect.getsource(delta)
    module_tree = ast.parse(source)
    (function_def,) = module_tree.body
    assert isinstance(function_def, ast.FunctionDef)
    body_without_docstring = function_def.body[1:]
    executable = ast.Module(body=body_without_docstring, type_ignores=[])
    string_constants = {
        node.value
        for node in ast.walk(executable)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }
    assert SUM_TAKER_LONG_SHORT_VOL_RATIO not in string_constants


def test_delta_computes_the_difference_between_two_stock_like_readings() -> None:
    """`delta()` over two readings of the SAME metric is the plain subtraction."""
    before = PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1.5000"))
    after = PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1.6200"))
    assert delta(before, after) == Decimal("0.1200")


def test_delta_refuses_two_different_metrics() -> None:
    """`delta()` between two DIFFERENT metrics is not a delta of anything."""
    a = PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1"))
    b = PositionRatioObservation(metric="sum_toptrader_long_short_ratio", value=Decimal("2"))
    with pytest.raises(MismatchedRatioMetricError, match="count_long_short_ratio"):
        delta(a, b)


def test_taker_ratio_components_has_no_value_field_delta_could_reach_for() -> None:
    """The structural proof `TakerRatioComponents` cannot satisfy `delta()`'s shape at all."""
    field_names = {field.name for field in fields(TakerRatioComponents)}
    assert "value" not in field_names
    assert field_names == {"buy_vol", "sell_vol"}


# ═══════════════════════════════════════════════════════════════════════════════════════════
# D6.6 — resampling the taker ratio to a coarser timeframe refuses; it never sums the ratio
# ═══════════════════════════════════════════════════════════════════════════════════════════


def test_d6_6_naive_resample_of_the_real_taker_series_refuses() -> None:
    """Real BTC values (3 consecutive 5-min buckets) — the refusal fires regardless of content.

    This is `CA-F2-5` as a runtime call: "pedir TF 15m na série taker recusa; nunca devolve
    3,1809" — the assertion is that NO number ever comes back, not that a specific one does.
    """
    path = require_fixture(
        "binance/metrics/btcusdt/2026-08-23.csv", expected_md5="fc8c0fba983194cf356a7d172b3bd39e"
    )
    rows = sorted(read_raw_metrics_rows(path), key=lambda row: row.create_time_ms)
    three_buckets = [row.sum_taker_long_short_vol_ratio for row in rows[:3]]
    assert len(three_buckets) == 3
    with pytest.raises(NonAggregableFlowRatioError, match="3 bare"):
        resample_bare_taker_ratio_refuses(three_buckets)


def test_resample_bare_taker_ratio_refuses_never_touches_its_argument() -> None:
    """The refusal fires BEFORE any arithmetic.

    Proven by giving it values that would raise on division (all zero), which would only ever
    surface if the function computed something instead of refusing outright.
    """
    with pytest.raises(NonAggregableFlowRatioError):
        resample_bare_taker_ratio_refuses([Decimal("0"), Decimal("0"), Decimal("0")])


def test_resample_taker_ratio_recomputes_from_sigma_buy_over_sigma_sell() -> None:
    """The ONLY legitimate coarsening: `Sigma buy_vol / Sigma sell_vol`, never `Sigma ratio`.

    Synthetic — this repo's fixture corpus has no `buy_vol`/`sell_vol` yet (item 6.10 lands the
    SHAPE, not a REST capture), so this is `[INFERRED]` numbers chosen to make the point
    `SPEC-001` §5.11 makes: summing the RATIO field across 3 buckets would give a nonsense
    figure (here, 4,50 — three readings of 1,50 summed), while the correct recompute from the
    components gives the true single-window ratio (1,50), because the three buckets share an
    identical buy/sell split.
    """
    components = [
        TakerRatioComponents(buy_vol=Decimal("150"), sell_vol=Decimal("100")),
        TakerRatioComponents(buy_vol=Decimal("150"), sell_vol=Decimal("100")),
        TakerRatioComponents(buy_vol=Decimal("150"), sell_vol=Decimal("100")),
    ]
    naive_sum_of_ratios = sum((component.ratio for component in components), start=Decimal(0))
    assert naive_sum_of_ratios == Decimal("4.50")
    assert resample_taker_ratio_to_timeframe(components) == Decimal("1.50")


def test_resample_taker_ratio_refuses_an_empty_window() -> None:
    """An empty window has no components to sum, so there is no ratio to derive."""
    with pytest.raises(ValueError, match="empty window"):
        resample_taker_ratio_to_timeframe([])


def test_resample_position_ratio_returns_last_on_the_edge_never_mean() -> None:
    """`SPEC-001` §5.11 "RATIO de estoque": `last()` is legitimate, `mean()` is PROIBIDO."""
    observations = [
        PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1.10")),
        PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1.20")),
        PositionRatioObservation(metric="count_long_short_ratio", value=Decimal("1.90")),
    ]
    result = resample_position_ratio_to_timeframe(observations)
    assert result.value == Decimal("1.90")
    mean_would_have_been = sum(
        (observation.value for observation in observations), start=Decimal(0)
    ) / len(observations)
    assert result.value != mean_would_have_been


def test_resample_position_ratio_refuses_an_empty_window() -> None:
    """An empty window has no `last()` element to return."""
    with pytest.raises(ValueError, match="empty window"):
        resample_position_ratio_to_timeframe([])


# ═══════════════════════════════════════════════════════════════════════════════════════════
# Item 6.10 — `buy_vol`/`sell_vol` are never discarded, and a zero/negative leg is refused
# ═══════════════════════════════════════════════════════════════════════════════════════════


def test_taker_ratio_components_carries_both_legs_and_derives_the_ratio() -> None:
    """`buy_vol`/`sell_vol` are never discarded (item 6.10) — `ratio` derives from both."""
    components = TakerRatioComponents(buy_vol=Decimal("296181.327"), sell_vol=Decimal("153525.862"))
    assert components.buy_vol == Decimal("296181.327")
    assert components.sell_vol == Decimal("153525.862")
    assert components.ratio == components.buy_vol / components.sell_vol


def test_taker_ratio_components_refuses_a_negative_leg() -> None:
    """A negative volume leg is not a value the REST endpoint can publish."""
    with pytest.raises(InvalidTakerVolumeError, match="negative"):
        TakerRatioComponents(buy_vol=Decimal("-1"), sell_vol=Decimal("1"))


def test_taker_ratio_components_refuses_a_zero_denominator() -> None:
    """`SPEC-001` §5.3 `ZL-1..3`: a zero denominator makes the ratio undefined, not infinite."""
    with pytest.raises(InvalidTakerVolumeError, match="sell_vol=0"):
        TakerRatioComponents(buy_vol=Decimal("1"), sell_vol=Decimal("0"))
