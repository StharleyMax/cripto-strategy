"""Parsing and the requirement floors of `CA-F0-13`, offline over JSON fixtures — zero network."""

from __future__ import annotations

import json
from datetime import date

import pytest

from src.modules.sentimento.domain.coinalyze_daily_series import (
    LIQUIDATION_REQUIREMENT,
    OPEN_INTEREST_REQUIREMENT,
    DailyPoint,
    MalformedCoinalizeResponseError,
    SeriesKind,
    SeriesRequirement,
    daily_points_from_stored_json,
    evaluate_series_requirement,
    history_path_for,
    parse_daily_points,
    to_coinalyze_symbol,
)


def _body(history: list[dict[str, object]], symbol: str = "BTCUSDT_PERP.A") -> bytes:
    """Build a wire-shaped response body: one symbol, its history."""
    return json.dumps([{"symbol": symbol, "history": history}]).encode("utf-8")


def test_to_coinalyze_symbol_appends_the_binance_perp_suffix() -> None:
    """`docs/medicao-coinalyze.md` §5: `BTCUSDT` -> `BTCUSDT_PERP.A`, Binance's measured code."""
    assert to_coinalyze_symbol("BTCUSDT") == "BTCUSDT_PERP.A"


def test_to_coinalyze_symbol_refuses_an_already_suffixed_symbol() -> None:
    """Double-suffixing would silently look like 'symbol not found' instead of a caller bug."""
    with pytest.raises(ValueError, match="_PERP"):
        to_coinalyze_symbol("BTCUSDT_PERP.A")


def test_to_coinalyze_symbol_refuses_an_empty_symbol() -> None:
    """An empty symbol has no honest translation."""
    with pytest.raises(ValueError, match="empty binance_symbol"):
        to_coinalyze_symbol("   ")


def test_history_path_for_builds_the_daily_query() -> None:
    """The path names the endpoint, `interval=daily`, and the closed window — nothing else."""
    path = history_path_for(SeriesKind.OPEN_INTEREST, "BTCUSDT_PERP.A", 1_000, 2_000)

    assert path == (
        "/v1/open-interest-history?symbols=BTCUSDT_PERP.A&interval=daily&from=1000&to=2000"
    )


def test_history_path_for_refuses_an_inverted_or_empty_window() -> None:
    """A window that enumerates nothing is a bug at the call site, not a legal empty request."""
    with pytest.raises(ValueError, match="inverted or empty window"):
        history_path_for(SeriesKind.LIQUIDATION, "BTCUSDT_PERP.A", 2_000, 2_000)


def test_parse_daily_points_reads_every_point_and_keeps_the_raw_dict() -> None:
    """Only `t` is interpreted; `o/h/l/c` ride through in `raw`, untouched — 'grava cru'."""
    body = _body(
        [
            {"t": 1_577_836_800, "o": 1.0, "h": 2.0, "l": 0.5, "c": 1.5},
            {"t": 1_577_923_200, "o": 1.5, "h": 2.5, "l": 1.0, "c": 2.0},
        ]
    )

    points = parse_daily_points(body)

    assert points == (
        DailyPoint(1_577_836_800, {"t": 1_577_836_800, "o": 1.0, "h": 2.0, "l": 0.5, "c": 1.5}),
        DailyPoint(1_577_923_200, {"t": 1_577_923_200, "o": 1.5, "h": 2.5, "l": 1.0, "c": 2.0}),
    )
    assert points[0].date_utc == date(2020, 1, 1)


def test_parse_daily_points_on_an_empty_array_is_legitimate_zero_history() -> None:
    """`[]` is a `200` saying 'this symbol has no history here' — not a parse failure."""
    assert parse_daily_points(b"[]") == ()


@pytest.mark.parametrize(
    "body",
    [
        b"not json at all",
        b'{"symbol": "x"}',
        b'[{"symbol": "x"}]',
        b'[{"symbol": "x", "history": "not-a-list"}]',
        b'[{"symbol": "x", "history": [{"o": 1.0}]}]',
        b'[{"symbol": "x", "history": [{"t": "not-an-int"}]}]',
        b"[{}, {}]",
    ],
)
def test_parse_daily_points_refuses_every_malformed_shape(body: bytes) -> None:
    """Each shape is a DIFFERENT way the wire contract could break, and none is swallowed."""
    with pytest.raises(MalformedCoinalizeResponseError):
        parse_daily_points(body)


def test_daily_points_from_stored_json_round_trips_quarantined_series_entry() -> None:
    """`T-03.11` reads what `QuarantinedSeriesEntry.points_json()` wrote: bare array, no wrapper."""
    points = (
        DailyPoint(1_577_836_800, {"t": 1_577_836_800, "l": "1.0", "s": "0.5"}),
        DailyPoint(1_577_923_200, {"t": 1_577_923_200, "l": "2.0", "s": "0.0"}),
    )
    stored = json.dumps([dict(point.raw) for point in points])

    parsed = daily_points_from_stored_json(stored)

    assert parsed == points


def test_daily_points_from_stored_json_on_an_empty_array_is_legitimate_zero_history() -> None:
    """Same "zero history is legitimate" rule `parse_daily_points` already applies."""
    assert daily_points_from_stored_json("[]") == ()


@pytest.mark.parametrize(
    "stored",
    [
        "not json at all",
        '{"symbol": "x"}',
        '[{"o": 1.0}]',
        '[{"t": "not-an-int"}]',
    ],
)
def test_daily_points_from_stored_json_refuses_every_malformed_shape(stored: str) -> None:
    """The stored shape is unwrapped ONE level from the wire shape — still validated the same."""
    with pytest.raises(MalformedCoinalizeResponseError):
        daily_points_from_stored_json(stored)


def test_the_open_interest_requirement_matches_ca_f0_13() -> None:
    """`docs/medicao-coinalyze.md` §1.2: 2.409 dias medidos, 2020-01-21 -> hoje."""
    assert OPEN_INTEREST_REQUIREMENT.min_points == 2400
    assert OPEN_INTEREST_REQUIREMENT.first_point_on_or_before == date(2020, 1, 21)


def test_the_liquidation_requirement_matches_ca_f0_13() -> None:
    """`docs/medicao-coinalyze.md` §1.2/§2.1: 730 dias medidos, 2024-08-26 -> hoje."""
    assert LIQUIDATION_REQUIREMENT.min_points == 700
    assert LIQUIDATION_REQUIREMENT.first_point_on_or_before == date(2024, 8, 26)


def test_a_requirement_of_zero_points_is_refused_at_construction() -> None:
    """A requirement nobody could fail to meet does not measure coverage."""
    with pytest.raises(ValueError, match="min_points"):
        SeriesRequirement(
            SeriesKind.OPEN_INTEREST, min_points=0, first_point_on_or_before=date(2020, 1, 1)
        )


def _points_from(epoch_seconds: list[int]) -> tuple[DailyPoint, ...]:
    """Build minimal points from bare timestamps, for requirement-evaluation tests."""
    return tuple(DailyPoint(t, {"t": t}) for t in epoch_seconds)


def test_evaluate_series_requirement_meets_when_both_count_and_depth_pass() -> None:
    """The falsifier's positive case: enough points, deep enough, `met` is `True`."""
    points = _points_from([1_577_836_800 + day * 86_400 for day in range(2_500)])

    verdict = evaluate_series_requirement(OPEN_INTEREST_REQUIREMENT, points)

    assert verdict.met is True
    assert verdict.n_points == 2500
    assert verdict.first_point_date == date(2020, 1, 1)
    assert verdict.reasons == ()


def test_evaluate_series_requirement_fails_on_count_alone() -> None:
    """Deep enough, but too few points: `met` is `False` and the reason names the count."""
    points = _points_from([1_577_836_800, 1_577_836_800 + 86_400])

    verdict = evaluate_series_requirement(OPEN_INTEREST_REQUIREMENT, points)

    assert verdict.met is False
    assert any("n_points" in reason for reason in verdict.reasons)
    assert not any("first_point_date" in reason for reason in verdict.reasons)


def test_evaluate_series_requirement_fails_on_depth_alone() -> None:
    """Enough points, but too shallow: `met` is `False` and the reason names the date."""
    recent_start = 1_700_000_000
    points = _points_from([recent_start + day * 86_400 for day in range(2_500)])

    verdict = evaluate_series_requirement(OPEN_INTEREST_REQUIREMENT, points)

    assert verdict.met is False
    assert any("first_point_date" in reason for reason in verdict.reasons)
    assert not any("n_points" in reason for reason in verdict.reasons)


def test_evaluate_series_requirement_on_zero_points_fails_with_both_reasons() -> None:
    """No history at all is the double failure — never a `None` crash on `first_point_date`."""
    verdict = evaluate_series_requirement(LIQUIDATION_REQUIREMENT, ())

    assert verdict.met is False
    assert verdict.n_points == 0
    assert verdict.first_point_date is None
    assert len(verdict.reasons) == 2


def test_evaluate_series_requirement_at_exactly_the_floor_is_met() -> None:
    """The boundary is inclusive both ways: `>=` on count, `<=` on date — never off by one."""
    points = _points_from(
        [
            int(
                date(2024, 8, 26).toordinal() * 86_400
                - date(1970, 1, 1).toordinal() * 86_400
                + day * 86_400
            )
            for day in range(700)
        ]
    )

    verdict = evaluate_series_requirement(LIQUIDATION_REQUIREMENT, points)

    assert verdict.n_points == 700
    assert verdict.first_point_date == date(2024, 8, 26)
    assert verdict.met is True
