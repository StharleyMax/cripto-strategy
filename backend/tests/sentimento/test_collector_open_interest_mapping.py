"""`T-03.3`: the `openInterestHist` -> `SeriesRow` mapping, and the SIGN of its RS-3.4 cut.

Every point literal below is shaped exactly like a real one — the payload keys were measured,
not guessed: `[MEDIDO 2026-09-12: GET /futures/data/openInterestHist?symbol=BTCUSDT&period=5m
-> chaves ['CMCCirculatingSupply', 'sumOpenInterest', 'sumOpenInterestValue', 'symbol',
'timestamp'], n=1 resposta de 12 pontos]`.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance
from src.modules.sentimento.use_cases.collector_run_mapping import (
    OPEN_INTEREST_HIST_ENDPOINT,
    OPEN_INTEREST_OBSERVER_ID,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    OPEN_INTEREST_BUCKET_WIDTH_MS,
    MalformedOpenInterestPointError,
    build_open_interest_to_rows,
    is_settled_open_interest_point,
    open_interest_bucket_end,
    open_interest_value_raw,
)
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog

# A 5-minute grid instant, and the two neighbours around it. `% 300_000 == 0` is not decoration:
# `[MEDIDO 2026-09-12: todos os 12 `timestamp` de uma pagina real satisfazem
# `timestamp % 300000 == 0`, deltas consecutivos = {300000}]`.
_GRID_INSTANT_MS = 1_789_218_000_000
_PREVIOUS_INSTANT_MS = _GRID_INSTANT_MS - OPEN_INTEREST_BUCKET_WIDTH_MS
_NEXT_INSTANT_MS = _GRID_INSTANT_MS + OPEN_INTEREST_BUCKET_WIDTH_MS


def _point(timestamp_ms: int, sum_open_interest: str = "103826.91100000") -> dict[str, object]:
    """Build one raw point with the five fields the real payload carries."""
    return {
        "symbol": "BTCUSDT",
        "sumOpenInterest": sum_open_interest,
        "sumOpenInterestValue": "8025483171.07800000",
        "CMCCirculatingSupply": "20083028.00000000",
        "timestamp": timestamp_ms,
    }


def test_the_row_lands_under_the_series_key_id_the_served_catalog_registers() -> None:
    """The writer's id and the SERVED catalog's id are the same, or the chart is empty at 422.

    This is the failure whose two halves both look healthy in isolation: `md.series` full of
    rows, `/api/v1/series-history` answering `422 UnknownSeriesKeyIdError` for the id the panel
    asks with. It is checked against `list_series_catalog` — the function the API actually
    serves — rather than against a rebuilt key, so a future divergence introduced ANYWHERE
    between the two fails here.
    """
    rows = build_open_interest_to_rows()(_GRID_INSTANT_MS, "BTCUSDT", [_point(_GRID_INSTANT_MS)])

    served = {
        entry.key.series_key_id()
        for entry in list_series_catalog("BTCUSDT").entries
        if entry.key.metric == "sum_open_interest" and entry.key.provider == "binance"
    }
    assert len(rows) == 1
    assert rows[0].series_key_id in served


def test_every_pilot_instrument_is_written_under_its_own_served_id() -> None:
    """`unit` is DERIVED, so `ETHUSDT` must not be published under `BTCUSDT`'s id (PR #215)."""
    to_rows = build_open_interest_to_rows()
    for symbol in ("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"):
        rows = to_rows(_GRID_INSTANT_MS, symbol, [_point(_GRID_INSTANT_MS)])
        served = {
            entry.key.series_key_id()
            for entry in open_interest_catalog_entries(symbol).entries
            if entry.key.provider == "binance"
        }
        assert len(rows) == 1, symbol
        assert rows[0].series_key_id in served, symbol
        assert (
            rows[0].series_key_id == binance_open_interest_key(instrument_id=symbol).series_key_id()
        )


def test_a_point_stamped_after_the_observation_instant_is_the_one_dropped() -> None:
    """⛔ THE FALSIFIER OF THE SIGN — it pins WHICH points survive, not that a filter exists.

    Observing AT `_GRID_INSTANT_MS`, the previous instant and the instant itself are settled
    and the next one is not. Flipping the comparison in `is_settled_open_interest_point`
    (`<=` -> `>=`, or `<=` -> `<`) changes WHICH of the three survives, so every mutation of
    the sign fails one of the three assertions below.
    """
    rows = build_open_interest_to_rows()(
        _GRID_INSTANT_MS,
        "BTCUSDT",
        [
            _point(_PREVIOUS_INSTANT_MS, "1.0"),
            _point(_GRID_INSTANT_MS, "2.0"),
            _point(_NEXT_INSTANT_MS, "3.0"),
        ],
    )

    assert [row.bucket_end for row in rows] == [_PREVIOUS_INSTANT_MS, _GRID_INSTANT_MS]
    assert [row.value_raw for row in rows] == ["1.0", "2.0"]
    assert all(row.bucket_end <= _GRID_INSTANT_MS for row in rows)


def test_the_boundary_tick_counts_as_settled_and_the_next_millisecond_does_not() -> None:
    """`bucket_end == observed_at` is admitted; `bucket_end == observed_at + 1` is not."""
    assert is_settled_open_interest_point(_point(_GRID_INSTANT_MS), _GRID_INSTANT_MS) is True
    assert is_settled_open_interest_point(_point(_GRID_INSTANT_MS), _GRID_INSTANT_MS - 1) is False


def test_bucket_end_is_the_source_label_itself_and_not_the_label_plus_one_bucket() -> None:
    """The measured publication lag is what forbids `timestamp + 300_000` as `bucket_end`.

    `[MEDIDO 2026-09-12: o ponto rotulado 1789218300000 apareceu em now=1789218306231, isto e
    6.231 ms DEPOIS do proprio rotulo, e o valor ficou estavel por 240 s ate o proximo ponto]`
    — a point published 6 s into `[T, T+300_000)` cannot be an aggregate over that window, so
    `T` is the instant of the reading and stamping the row at `T + 300_000` would publish a
    reading for an instant five minutes ahead of the only one the source measured.
    """
    assert open_interest_bucket_end(_point(_GRID_INSTANT_MS)) == _GRID_INSTANT_MS
    assert open_interest_bucket_end(_point(_GRID_INSTANT_MS)) != (
        _GRID_INSTANT_MS + OPEN_INTEREST_BUCKET_WIDTH_MS
    )


def test_value_raw_is_sum_open_interest_and_never_the_usdt_notional() -> None:
    """`denom="base"`, so the raw string is the base-asset quantity, not `sumOpenInterestValue`."""
    point = _point(_GRID_INSTANT_MS, "103826.91100000")
    assert open_interest_value_raw(point) == "103826.91100000"
    rows = build_open_interest_to_rows()(_GRID_INSTANT_MS, "BTCUSDT", [point])
    assert rows[0].value_raw == "103826.91100000"
    assert rows[0].value_raw != point["sumOpenInterestValue"]


def test_a_symbol_outside_the_pilot_universe_yields_no_rows() -> None:
    """`INITIAL_SYMBOLS` is the filter every producer in this module applies."""
    rows = build_open_interest_to_rows()(_GRID_INSTANT_MS, "DOGEUSDT", [_point(_GRID_INSTANT_MS)])
    assert rows == ()


def test_the_provenance_columns_separate_the_two_clocks() -> None:
    """`bucket_end`/`event_time` are the SOURCE's instant; the rest are this collector's."""
    received_at = _GRID_INSTANT_MS + 6_231
    rows = build_open_interest_to_rows()(received_at, "BTCUSDT", [_point(_GRID_INSTANT_MS)])

    row = rows[0]
    assert (row.bucket_end, row.event_time) == (_GRID_INSTANT_MS, _GRID_INSTANT_MS)
    assert (row.available_at, row.ingested_at, row.observed_at) == (
        received_at,
        received_at,
        received_at,
    )
    assert row.availability_source is AvailabilitySource.OBSERVED
    assert row.provenance is Provenance.OBSERVED
    assert row.src_label_raw == OPEN_INTEREST_HIST_ENDPOINT
    assert row.source == OPEN_INTEREST_HIST_ENDPOINT
    assert row.observer_id == OPEN_INTEREST_OBSERVER_ID
    # The source DOES declare finality here, unlike `klines_volume`'s in-progress bar:
    # `[MEDIDO 2026-09-12: valor estavel por 240 s depois de publicado, ate o proximo ponto]`.
    assert row.is_final is True


def test_a_point_without_an_integer_timestamp_is_refused_and_names_the_field() -> None:
    """A malformed point raises rather than being stamped at a guessed instant."""
    with pytest.raises(MalformedOpenInterestPointError, match="timestamp"):
        open_interest_bucket_end({"sumOpenInterest": "1.0"})


def test_a_point_without_a_usable_value_is_refused_and_names_the_field() -> None:
    """`value_raw` is `NOT NULL`; a blank one is refused at construction, not at insert."""
    with pytest.raises(MalformedOpenInterestPointError, match="sumOpenInterest"):
        open_interest_value_raw({"timestamp": _GRID_INSTANT_MS, "sumOpenInterest": "   "})
