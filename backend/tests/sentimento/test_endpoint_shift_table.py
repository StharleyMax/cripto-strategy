"""`CA-F2-1`, plan `06` item 6.2 — the endpoint shift table, run against real captures.

The falsifier this file exists to run, `docs/context/plataforma-dados/handoff/T-06.2.md`
literal: comparing dump-vs-REST timestamp sets for `openInterestHist` must give **288 vs 288**
identical sets and **MAE = 0.0** — "se a tabela estiver errada (shift no endpoint errado, ou
faltando a exceção do `takerlongshortRatio`), esse teste tem que reprovar." Every assertion
below reads the real fixtures on disk (`data/binance/metrics/btcusdt/2026-08-23.csv`,
`data/binance/rest/*.json`) through
`src.modules.sentimento.domain.endpoint_shift_table` directly, so weakening the table (wrong
sign, wrong endpoint, a `.get(..., default)`) fails a test here instead of drifting from it in
silence.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from src.modules.sentimento.domain.endpoint_shift_table import (
    ENDPOINT_LABEL_SHIFT_MS,
    MismatchedSeriesLengthError,
    UnknownEndpointShiftError,
    label_shift_for_endpoint,
    match_dump_to_rest_by_shifted_timestamp,
    mean_absolute_error,
    shift_dump_timestamp_to_rest,
)
from src.modules.sentimento.infra.metrics_csv_reader import read_raw_metrics_rows
from tests.helpers.data_fixtures import require_fixture

# The dump day whose REST-captured `openInterestHist` counterpart is fully on disk: 288 rows on
# each side, no truncation at either edge of the day (`docs/recorte-plataforma.md` line 163).
_METRICS_FIXTURE = "binance/metrics/btcusdt/2026-08-23.csv"
_METRICS_MD5 = "fc8c0fba983194cf356a7d172b3bd39e"
_REST_OI_FIXTURE = "binance/rest/rest_oi.json"
_REST_OI_MD5 = "a3a941904ab9bbe27024929d157ca6d1"
_REST_TAKER_FIXTURE = "binance/rest/r_takerlongshortRatio.json"
_REST_TAKER_MD5 = "75821a6532a742127eb91bf2a07caddb"


def _read_rest_json(path: Path) -> tuple[dict[str, Any], ...]:
    """Parse a REST capture — plain `json.loads`, never production `infra`.

    `docs/context/plataforma-dados/handoff/T-06.2.md`: "qualquer leitura de arquivo real de
    dump/REST para o teste mora em fixture, não em I/O de produção" (`ADR-016`/`Natureza`) —
    this repository has no runtime need to re-read a historical REST snapshot, only this test
    does, so the parse lives here and not under `src/modules/sentimento/infra/`.
    """
    return tuple(json.loads(path.read_text()))


# ── the table itself — every measured endpoint, and the refusal of anything else ────────────


@pytest.mark.parametrize(
    "endpoint",
    [
        "openInterestHist",
        "topLongShortPositionRatio",
        "topLongShortAccountRatio",
        "globalLongShortAccountRatio",
    ],
)
def test_the_four_measured_endpoints_share_the_positive_five_minute_shift(endpoint: str) -> None:
    """`CA-F2-1`: dump `create_time` sits 5 minutes before REST for these four.

    The `label_shift` convention (`SeriesKey`, `SPEC-001` §2.2) is `+300_000`, not `-300_000` —
    see the module docstring for the sign derivation.
    """
    assert label_shift_for_endpoint(endpoint) == 300_000


def test_takerlongshortratio_is_the_measured_exception_with_no_shift() -> None:
    """The one endpoint whose dump `create_time` already IS the REST timestamp."""
    assert label_shift_for_endpoint("takerlongshortRatio") == 0


def test_the_table_has_exactly_the_five_measured_endpoints() -> None:
    """No sixth entry has snuck in, and none of the five is missing."""
    assert set(ENDPOINT_LABEL_SHIFT_MS) == {
        "openInterestHist",
        "topLongShortPositionRatio",
        "topLongShortAccountRatio",
        "globalLongShortAccountRatio",
        "takerlongshortRatio",
    }


def test_an_unmeasured_endpoint_is_refused_not_defaulted() -> None:
    """`CA-F2-1`: the exception is PER ENDPOINT.

    A name nobody measured never inherits either value, which a `.get(endpoint, 300_000)`
    would do silently.
    """
    with pytest.raises(UnknownEndpointShiftError, match="unmeasuredEndpoint"):
        label_shift_for_endpoint("unmeasuredEndpoint")


def test_shift_dump_timestamp_to_rest_adds_the_endpoints_own_shift() -> None:
    """The convenience wrapper adds exactly the table's own value — no rounding, no clamping."""
    assert shift_dump_timestamp_to_rest(1_000, endpoint="openInterestHist") == 301_000
    assert shift_dump_timestamp_to_rest(1_000, endpoint="takerlongshortRatio") == 1_000


# ── the falsifier: real dump vs real REST, `openInterestHist` ───────────────────────────────


def _open_interest_dump_rows() -> tuple[tuple[int, Decimal], ...]:
    path = require_fixture(_METRICS_FIXTURE, expected_md5=_METRICS_MD5)
    raw_rows = read_raw_metrics_rows(path)
    return tuple((row.create_time_ms, row.sum_open_interest) for row in raw_rows)


def _open_interest_rest_rows() -> tuple[tuple[int, Decimal], ...]:
    path = require_fixture(_REST_OI_FIXTURE, expected_md5=_REST_OI_MD5)
    return tuple(
        (int(entry["timestamp"]), Decimal(str(entry["sumOpenInterest"])))
        for entry in _read_rest_json(path)
    )


def test_open_interest_hist_shift_matches_288_of_288_with_zero_mae() -> None:
    """The literal falsifier: `openInterestHist` dump vs REST, 288 vs 288, MAE 0.0.

    `[MEDIDO 2026-09-03]`: both fixtures have exactly 288 rows for the same UTC day, and
    joining on `create_time + label_shift_for_endpoint("openInterestHist")` matches every
    single one — proving the shifted timestamp SETS are identical, not merely overlapping.
    """
    dump_rows = _open_interest_dump_rows()
    rest_rows = _open_interest_rest_rows()
    assert len(dump_rows) == 288
    assert len(rest_rows) == 288

    shift_ms = label_shift_for_endpoint("openInterestHist")
    matched = match_dump_to_rest_by_shifted_timestamp(dump_rows, rest_rows, shift_ms=shift_ms)

    assert len(matched) == 288, "the shifted dump timestamp set must equal the REST set, 288/288"
    observed = tuple(dump_value for dump_value, _ in matched)
    expected = tuple(rest_value for _, rest_value in matched)
    assert mean_absolute_error(observed, expected) == Decimal("0")


def test_wrong_shift_reprovas_the_falsifier() -> None:
    """The mutation this suite must catch: apply the taker's ZERO shift to `openInterestHist`.

    `docs/context/plataforma-dados/handoff/T-06.2.md`, literal: "se a tabela estiver errada
    (shift no endpoint errado ...), esse teste tem que reprovar" — this is that failing case,
    proven rather than asserted.

    `[MEDIDO 2026-09-03]`: the MATCH COUNT alone does not catch this mutation — `daily/metrics`
    publishes on the same 5-minute grid `openInterestHist` does, so an UNSHIFTED dump timestamp
    still collides with SOME REST timestamp 287 times out of 288 purely by grid periodicity
    (row `i`'s dump timestamp equals row `i+1`'s REST-minus-shift timestamp). What the wrong
    shift actually breaks is the VALUE at each collision: `sum_open_interest` paired against
    the WRONG bucket's `sumOpenInterest` has a mean absolute error of ~41.9 BTC (max ~496.8),
    against the correct shift's exact `0.0` — this is the falsifier that must reprove, and a
    weaker one built only on match count would have passed a wrong shift by accident.
    """
    dump_rows = _open_interest_dump_rows()
    rest_rows = _open_interest_rest_rows()

    wrong_shift_ms = label_shift_for_endpoint("takerlongshortRatio")  # 0, the wrong table entry
    matched = match_dump_to_rest_by_shifted_timestamp(dump_rows, rest_rows, shift_ms=wrong_shift_ms)
    assert len(matched) > 0, "grid periodicity must still produce collisions to mismeasure"

    observed = tuple(dump_value for dump_value, _ in matched)
    expected = tuple(rest_value for _, rest_value in matched)
    assert mean_absolute_error(observed, expected) > Decimal("10")


# ── the exception, proven from its own fixture: shifting it makes things WORSE ───────────────


def _taker_dump_rows() -> tuple[tuple[int, Decimal], ...]:
    path = require_fixture(_METRICS_FIXTURE, expected_md5=_METRICS_MD5)
    raw_rows = read_raw_metrics_rows(path)
    return tuple((row.create_time_ms, row.sum_taker_long_short_vol_ratio) for row in raw_rows)


def _taker_rest_rows() -> tuple[tuple[int, Decimal], ...]:
    path = require_fixture(_REST_TAKER_FIXTURE, expected_md5=_REST_TAKER_MD5)
    return tuple(
        (int(entry["timestamp"]), Decimal(str(entry["buySellRatio"])))
        for entry in _read_rest_json(path)
    )


def test_takerlongshortratio_matches_tightly_with_no_shift() -> None:
    """The REST capture window only partially overlaps the dump day.

    `[MEDIDO 2026-09-03]`: a 500-point capture against a 288-point day, so this asserts on the
    OVERLAP, not on 288/288 — the overlap itself, at zero shift, is a tight match (mean
    absolute error well under the ratio's own smallest visible digit, `0.0001`).
    """
    dump_rows = _taker_dump_rows()
    rest_rows = _taker_rest_rows()

    shift_ms = label_shift_for_endpoint("takerlongshortRatio")
    matched = match_dump_to_rest_by_shifted_timestamp(dump_rows, rest_rows, shift_ms=shift_ms)

    assert len(matched) > 200, "the capture windows must overlap enough to prove the claim"
    observed = tuple(dump_value for dump_value, _ in matched)
    expected = tuple(rest_value for _, rest_value in matched)
    assert mean_absolute_error(observed, expected) < Decimal("0.001")


def test_shifting_takerlongshortratio_by_five_minutes_reprovas() -> None:
    """The mutation for the exception itself: apply the OTHER four endpoints' `+300_000` here.

    `[MEDIDO 2026-09-03]`: doing so does not merely reduce the match — it makes the mean
    absolute error roughly 5.000x larger (from ~0.0001 to ~0.62, on a ratio whose values sit
    near 1.0), which is the measured shape of "the exception is not applied by accident, it is
    contradicted by the data if you try."
    """
    dump_rows = _taker_dump_rows()
    rest_rows = _taker_rest_rows()

    wrong_shift_ms = label_shift_for_endpoint("openInterestHist")  # 300_000, the wrong entry
    matched = match_dump_to_rest_by_shifted_timestamp(dump_rows, rest_rows, shift_ms=wrong_shift_ms)
    assert len(matched) > 0, "some rows still collide by coincidence; the VALUES must diverge"

    observed = tuple(dump_value for dump_value, _ in matched)
    expected = tuple(rest_value for _, rest_value in matched)
    assert mean_absolute_error(observed, expected) > Decimal("0.5")


# ── `mean_absolute_error` / `match_dump_to_rest_by_shifted_timestamp` — unit-level guards ───


def test_mean_absolute_error_refuses_mismatched_lengths() -> None:
    """A 3-vs-2 pairing is an alignment bug, not a shorter series to average over."""
    with pytest.raises(MismatchedSeriesLengthError, match="3.*2"):
        mean_absolute_error([Decimal(1), Decimal(2), Decimal(3)], [Decimal(1), Decimal(2)])


def test_mean_absolute_error_refuses_an_empty_pair() -> None:
    """Zero pairs is not a measurement of zero error — it is no measurement at all."""
    with pytest.raises(MismatchedSeriesLengthError, match="at least one pair"):
        mean_absolute_error([], [])


def test_mean_absolute_error_over_a_simple_known_case() -> None:
    """`|1.0-1.5| + |2.0-2.0| + |3.0-2.5|`, averaged over 3, is exactly `1/3`."""
    observed = [Decimal("1.0"), Decimal("2.0"), Decimal("3.0")]
    expected = [Decimal("1.5"), Decimal("2.0"), Decimal("2.5")]

    assert mean_absolute_error(observed, expected) == Decimal("1") / Decimal("3")


def test_match_drops_rows_with_no_partner_on_either_side() -> None:
    """A dump row with no shifted REST partner (and vice versa) is dropped, not raised."""
    dump_rows = ((100, Decimal("1")), (200, Decimal("2")), (300, Decimal("3")))
    rest_rows = ((150, Decimal("10")), (250, Decimal("20")))  # 100+50, 200+50 — only these match

    matched = match_dump_to_rest_by_shifted_timestamp(dump_rows, rest_rows, shift_ms=50)

    assert matched == ((Decimal("1"), Decimal("10")), (Decimal("2"), Decimal("20")))
