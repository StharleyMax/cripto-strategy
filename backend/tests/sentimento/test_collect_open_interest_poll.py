"""`T-03.4`: settling one `/fapi/v1/openInterest` cycle — fates, rows, and the run record.

Pure: literal instants in, fates and rows out. The loop that reads the clock and publishes is
`test_collectors_cli_open_interest_poll_collector.py`'s subject; this file pins the part of a
cycle that decides which reading becomes which row, because that is where look-ahead and
carry-forward would enter.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_poll_key
from src.modules.sentimento.domain.open_interest_grid_stamp import (
    OPEN_INTEREST_ADMISSION_WINDOW_MS,
    OPEN_INTEREST_GRID_MS,
    StampedOpenInterest,
)
from src.modules.sentimento.domain.open_interest_snapshot import (
    OPEN_INTEREST_SNAPSHOT_ENDPOINT,
    OpenInterestFetch,
    OpenInterestFetchOutcome,
    OpenInterestSnapshot,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance
from src.modules.sentimento.use_cases.collect_open_interest_poll import (
    OpenInterestPollFate,
    TimedOpenInterestFetch,
    settle_open_interest_poll_cycle,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    OPEN_INTEREST_OBSERVER_ID,
    OPEN_INTEREST_POLL_ENDPOINT,
    OPEN_INTEREST_POLL_OBSERVER_ID,
    WEIGHT_NOT_READABLE,
    RejectionWithoutReasonError,
    build_open_interest_poll_run,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_poll_to_rows,
)

# `T-03.1` capture, 2026-09-24 (the same literals `test_open_interest_grid_stamp.py` replays):
# BTCUSDT `time` 1790287793703 for a request sent at 1790287796821; ETHUSDT `time` 1790287791035.
REAL_BTC_TIME_MS = 1_790_287_793_703
REAL_BTC_SENT_MS = 1_790_287_796_821
REAL_ETH_TIME_MS = 1_790_287_791_035
T = 1_790_287_800_000  # the grid instant at or after both captures
LEAD_MS = 5_000  # `[Q-STAMP-1]` §3: the call goes out at `T - 5 s`


def _read(
    symbol: str, event_time_ms: int, value: str = "96012.544", weight: int | None = 3
) -> OpenInterestFetch:
    """One `READ` outcome, shaped as `BinanceOpenInterestClient.fetch` hands it back."""
    return OpenInterestFetch(
        symbol=symbol,
        outcome=OpenInterestFetchOutcome.READ,
        status=200,
        weight_used=weight,
        snapshot=OpenInterestSnapshot(
            symbol=symbol, open_interest_raw=value, event_time_ms=event_time_ms
        ),
        failure=None,
    )


def _failed(symbol: str, outcome: OpenInterestFetchOutcome) -> OpenInterestFetch:
    """One failed outcome — `TRANSPORT` has no status, `HTTP_STATUS` has a refused one."""
    transport = outcome is OpenInterestFetchOutcome.TRANSPORT
    return OpenInterestFetch(
        symbol=symbol,
        outcome=outcome,
        status=None if transport else 418,
        weight_used=None if transport else 7,
        snapshot=None,
        failure="OSError: reset" if transport else "status 418: b'banned'",
    )


def _timed(fetch: OpenInterestFetch, sent_at_ms: int, rtt_ms: int = 300) -> TimedOpenInterestFetch:
    """Wrap a fetch with the two instants the collector reads around it."""
    return TimedOpenInterestFetch(
        fetch=fetch, sent_at_ms=sent_at_ms, received_at_ms=sent_at_ms + rtt_ms
    )


_TO_ROWS = build_open_interest_poll_to_rows()


# ── THE REAL CAPTURE, END TO END ──────────────────────────────────────────────────────────


def test_the_real_capture_becomes_one_row_per_symbol_at_t_with_its_own_time_kept() -> None:
    """Both captured readings are admitted at `T`, each row keeping the SOURCE's `time`.

    `bucket_end` is the grid instant and `event_time` is the response's `time` — two instants,
    never one. Morde: write `event_time = grid_instant` (the scheduler's `T`) and the staleness
    `bucket_end - event_time` collapses to zero on every row, which is exactly the fact the
    `quant-architect`'s one-column verification (`Q-STAMP-1` §1) needs to exist.
    """
    settlement = settle_open_interest_poll_cycle(
        [
            _timed(_read("BTCUSDT", REAL_BTC_TIME_MS), REAL_BTC_SENT_MS),
            _timed(_read("ETHUSDT", REAL_ETH_TIME_MS, "2310456.114"), REAL_BTC_SENT_MS + 310),
        ],
        {},
        _TO_ROWS,
    )

    assert [(row.symbol, row.bucket_end, row.event_time) for row in settlement.rows] == [
        ("BTCUSDT", T, REAL_BTC_TIME_MS),
        ("ETHUSDT", T, REAL_ETH_TIME_MS),
    ]
    assert [call.staleness_ms for call in settlement.calls] == [6_297, 8_965]
    assert settlement.calls[0].lag_ms == REAL_BTC_SENT_MS - REAL_BTC_TIME_MS == 3_118


def test_every_written_row_satisfies_the_anti_lookahead_property() -> None:
    """For every row, `0 <= bucket_end - event_time <= 20 000` — `Q-STAMP-1` §1 as a test.

    The sweep sends one call per symbol at `T - 5 s` with every lag from `-3 s` to `+16 s`
    in 250 ms steps, so the admitted rows span the whole window. A reading whose `time` is
    after `T` must never come out stamped `T`.
    """
    fetches = [
        _timed(_read(f"C{index}USDT", T - LEAD_MS - lag_ms), T - LEAD_MS)
        for index, lag_ms in enumerate(range(-3_000, 16_001, 250))
    ]
    settlement = settle_open_interest_poll_cycle(
        fetches,
        {},
        build_open_interest_poll_to_rows(
            symbols=frozenset(fetch.fetch.symbol for fetch in fetches)
        ),
    )

    assert settlement.rows, "the sweep must admit something, or the property is vacuous"
    for row in settlement.rows:
        assert 0 <= row.bucket_end - row.event_time <= OPEN_INTEREST_ADMISSION_WINDOW_MS
        assert row.bucket_end == T
    admitted_lags = [
        call.lag_ms
        for call in settlement.calls
        if call.fate is OpenInterestPollFate.ADMITTED and call.lag_ms is not None
    ]
    # `[Q-STAMP-1]` §3: with `d = 5 s` a reading is admitted iff `L` is in `[-5 s; 15 s]`.
    assert min(admitted_lags) == -3_000
    assert max(admitted_lags) == 15_000


# ── ABSENT, NEVER CARRIED ─────────────────────────────────────────────────────────────────


def test_a_failed_call_leaves_its_minute_absent_and_is_accounted_as_not_read() -> None:
    """A `TRANSPORT` failure yields NO row for that symbol — never last minute's value.

    The cycle receives nothing from the previous one but the watermark (an instant, not a
    value), so a carried reading has no way in. Morde: fill a failed symbol from the
    watermark's minute and a row appears for `BTCUSDT`.
    """
    settlement = settle_open_interest_poll_cycle(
        [
            _timed(_failed("BTCUSDT", OpenInterestFetchOutcome.TRANSPORT), T - LEAD_MS),
            _timed(_read("ETHUSDT", REAL_ETH_TIME_MS), T - LEAD_MS),
        ],
        {"BTCUSDT": T - OPEN_INTEREST_GRID_MS},
        _TO_ROWS,
    )

    assert [row.symbol for row in settlement.rows] == ["ETHUSDT"]
    assert [call.fate for call in settlement.calls] == [
        OpenInterestPollFate.NOT_READ,
        OpenInterestPollFate.ADMITTED,
    ]
    assert settlement.calls[0].lag_ms is None
    assert settlement.n_calls == 2
    assert settlement.n_read == 1
    assert settlement.shortfall_notes == "BTCUSDT: not_read (OSError: reset)"


def test_a_reading_taken_after_t_is_out_of_window_not_pulled_back_to_t() -> None:
    """A stalled send whose `time` lands after `T` goes nowhere (`Q-STAMP-1` §2, `L = -2,24 s`).

    Its ceiling is `T + 1 min` with ~57 s of staleness, outside the window, so the minute `T`
    stays ABSENT for that symbol and `T + 1 min` does not get it either.
    """
    settlement = settle_open_interest_poll_cycle(
        [_timed(_read("BTCUSDT", T + 2_240), T - 1_000)], {}, _TO_ROWS
    )

    assert settlement.rows == ()
    (call,) = settlement.calls
    assert call.fate is OpenInterestPollFate.OUT_OF_WINDOW
    assert call.grid_instant_ms is None
    assert call.staleness_ms is None
    assert call.lag_ms == -3_240


def test_two_readings_of_one_minute_keep_the_freshest_and_account_the_other() -> None:
    """Freshest wins inside a cycle, whatever the call order — the loser is `superseded`."""
    settlement = settle_open_interest_poll_cycle(
        [
            _timed(_read("BTCUSDT", T - 2_000, "2.0"), T - 1_000),
            _timed(_read("BTCUSDT", T - 9_000, "1.0"), T - 5_000),
        ],
        {},
        _TO_ROWS,
    )

    assert [(row.event_time, row.value_raw) for row in settlement.rows] == [(T - 2_000, "2.0")]
    assert [call.fate for call in settlement.calls] == [
        OpenInterestPollFate.ADMITTED,
        OpenInterestPollFate.SUPERSEDED,
    ]


def test_a_minute_already_written_is_not_written_again() -> None:
    """A reading stamped on a minute at or before the watermark is `behind_watermark`, no row.

    Morde: drop the watermark check and the same `(symbol, T)` gets a second row with a later
    `observed_at` — `md.series`' key would accept it, silently doubling the minute.
    """
    settlement = settle_open_interest_poll_cycle(
        [_timed(_read("BTCUSDT", REAL_BTC_TIME_MS), REAL_BTC_SENT_MS)],
        {"BTCUSDT": T},
        _TO_ROWS,
    )

    assert settlement.rows == ()
    (call,) = settlement.calls
    assert call.fate is OpenInterestPollFate.BEHIND_WATERMARK
    assert call.grid_instant_ms == T
    assert call.staleness_ms is None


def test_the_watermark_of_one_symbol_does_not_mask_another() -> None:
    """`newest_written` is per symbol: BTC's written minute says nothing about ETH's."""
    settlement = settle_open_interest_poll_cycle(
        [_timed(_read("ETHUSDT", REAL_ETH_TIME_MS), REAL_BTC_SENT_MS)],
        {"BTCUSDT": T},
        _TO_ROWS,
    )

    assert [row.symbol for row in settlement.rows] == ["ETHUSDT"]


# ── THE ROW ───────────────────────────────────────────────────────────────────────────────


def test_the_row_is_the_polled_series_of_its_symbol_observed_final_and_exact() -> None:
    """Identity of `T-03.3`, value as the source spelled it, instants kept apart."""
    stamped = StampedOpenInterest(
        symbol="SOLUSDT",
        grid_instant_ms=T,
        open_interest_raw="8123456.70",
        event_time_ms=T - 4_000,
    )

    (row,) = _TO_ROWS(T - 4_500, stamped)

    expected_key = binance_open_interest_poll_key(instrument_id="SOLUSDT")
    assert row.series_key_id == expected_key.series_key_id()
    assert row.source == row.src_label_raw == OPEN_INTEREST_SNAPSHOT_ENDPOINT
    assert row.bucket_end == T
    assert row.event_time == T - 4_000
    assert row.available_at == row.observed_at == row.ingested_at == T - 4_500
    assert row.availability_source is AvailabilitySource.OBSERVED
    assert row.provenance is Provenance.OBSERVED
    assert row.observer_id == OPEN_INTEREST_POLL_OBSERVER_ID != OPEN_INTEREST_OBSERVER_ID
    assert row.is_final is True
    assert row.value_raw == "8123456.70"


def test_a_symbol_outside_the_universe_yields_no_row() -> None:
    """The four-symbol filter every other producer applies, applied here too."""
    stamped = StampedOpenInterest(
        symbol="DOGEUSDT", grid_instant_ms=T, open_interest_raw="1", event_time_ms=T - 1
    )

    assert _TO_ROWS(T, stamped) == ()


# ── THE CYCLE'S ACCOUNT, AND THE RUN RECORD ───────────────────────────────────────────────


def test_the_cycle_reads_the_weight_header_and_the_first_refused_status() -> None:
    """`weight_used` is the largest header READ; `api_code` the first non-`200` status."""
    settlement = settle_open_interest_poll_cycle(
        [
            _timed(_read("BTCUSDT", REAL_BTC_TIME_MS, weight=11), REAL_BTC_SENT_MS),
            _timed(_failed("ETHUSDT", OpenInterestFetchOutcome.HTTP_STATUS), REAL_BTC_SENT_MS),
            _timed(_read("SOLUSDT", REAL_BTC_TIME_MS, weight=None), REAL_BTC_SENT_MS),
        ],
        {},
        _TO_ROWS,
    )

    assert settlement.weight_used == 11
    assert settlement.api_code == 418
    assert settlement.n_admitted == 2


def test_a_cycle_without_any_readable_header_reports_none() -> None:
    """No header read is `None`, never `0` — "not readable" is not "nothing spent"."""
    settlement = settle_open_interest_poll_cycle(
        [_timed(_failed("BTCUSDT", OpenInterestFetchOutcome.TRANSPORT), T)], {}, _TO_ROWS
    )

    assert settlement.weight_used is None
    assert settlement.api_code is None


def test_the_digest_covers_every_reading_in_call_order() -> None:
    """Two cycles that read different values have different `src_sha256`."""
    first = settle_open_interest_poll_cycle(
        [_timed(_read("BTCUSDT", REAL_BTC_TIME_MS, "1.0"), REAL_BTC_SENT_MS)], {}, _TO_ROWS
    )
    second = settle_open_interest_poll_cycle(
        [_timed(_read("BTCUSDT", REAL_BTC_TIME_MS, "2.0"), REAL_BTC_SENT_MS)], {}, _TO_ROWS
    )

    assert first.src_sha256 != second.src_sha256


def test_the_poll_run_expects_one_reading_per_call_and_leaves_n_written_to_the_writer() -> None:
    """`n_expected = n_calls`, `n_returned = n_read`; `n_written` is the writer's to close."""
    run = build_open_interest_poll_run(
        started_at="2026-09-25T00:00:55+00:00",
        ended_at="2026-09-25T00:00:56+00:00",
        n_calls=4,
        n_read=3,
        weight_used=None,
        api_code=None,
        verdict="ACCEPTED_WITH_WARNING",
        src_sha256="0" * 64,
        run_id="the-cycle",
        notes="BTCUSDT: not_read",
    )

    assert run.endpoint == OPEN_INTEREST_POLL_ENDPOINT == "/fapi/v1/openInterest"
    assert run.observer_id == OPEN_INTEREST_POLL_OBSERVER_ID
    assert (run.n_expected, run.n_returned) == (4, 3)
    assert run.n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS
    assert run.weight_used == WEIGHT_NOT_READABLE
    assert run.run_id == "the-cycle"


def test_a_rejected_poll_run_without_a_reason_cannot_be_built() -> None:
    """`RS-4`: the same refusal every other builder applies."""
    with pytest.raises(RejectionWithoutReasonError):
        build_open_interest_poll_run(
            started_at="a",
            ended_at="b",
            n_calls=4,
            n_read=0,
            weight_used=4,
            api_code=None,
            verdict="REJECTED",
            src_sha256="0" * 64,
        )
