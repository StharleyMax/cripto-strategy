"""`T-05.5`'s two mappings: the `IngestRun` of a cycle, and the `SeriesRow` of a bucket.

The sixth producer is the FIRST that is not Binance, and both mappings carry a term that would
be invisible if it were wrong — the `source` of the run and the `cohort` of the row. Each has a
test here that fails on the swap rather than on the crash.
"""

from __future__ import annotations

import hashlib

import pytest

from src.modules.sentimento.domain.liquidation_catalog import (
    COHORTS,
    coinalyze_liquidation_key,
)
from src.modules.sentimento.domain.liquidation_collection import (
    LIQUIDATION_BUCKET_MS,
    LIQUIDATION_HISTORY_PATH,
)
from src.modules.sentimento.domain.provenance import Provenance
from src.modules.sentimento.use_cases.collector_run_mapping import (
    CLOCK_SKEW_NOT_MEASURED_MS,
    COINALYZE_SOURCE,
    LIQUIDATION_HISTORY_ENDPOINT,
    LIQUIDATION_OBSERVER_ID,
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    build_liquidation_history_run,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    UnknownLiquidationSymbolError,
    build_liquidation_history_to_row,
)
from src.modules.sentimento.use_cases.persist_ntp_skew_run import SOURCE as BINANCE_SOURCE

_STARTED_AT = "2026-09-12T14:00:00.000Z"
_ENDED_AT = "2026-09-12T14:05:00.000Z"
_SHA = hashlib.sha256(b"body").hexdigest()
_BUCKET_START = 1_789_200_600
_RECEIVED_AT = 1_789_201_000_000


# ── THE RUN ───────────────────────────────────────────────────────────────────────────────


def test_the_liquidation_endpoint_literal_matches_the_collection_path() -> None:
    """The endpoint the record names and the path the request uses are the same string.

    Spelled twice because `use_cases` may not import `infra` and the policy module is the one
    that builds the query — so the pairing has to be executable, not commented.
    """
    assert LIQUIDATION_HISTORY_ENDPOINT == LIQUIDATION_HISTORY_PATH


def test_a_coinalyze_run_is_not_recorded_under_the_binance_source() -> None:
    """THE SWAP THAT WOULD BE INVISIBLE: a third party's numbers under an exchange's name.

    Every one of the 5.406 runs in production carries `binance-futures`
    `[MEDIDO 2026-09-12, n=5.406 runs: uma unica source]`, because every producer until now WAS
    Binance. `ADR-030`'s dashboard groups by this field, so recording Coinalyze under it would
    produce a plausible, complete, wrong answer to "where did this come from".
    """
    run = build_liquidation_history_run(
        started_at=_STARTED_AT,
        ended_at=_ENDED_AT,
        n_returned=7,
        n_calls=4,
        api_code=None,
        verdict="ACCEPTED",
        src_sha256=_SHA,
    )
    assert run.source == COINALYZE_SOURCE == "coinalyze"
    assert run.source != BINANCE_SOURCE


def test_the_run_prices_itself_in_the_unit_the_ceiling_is_denominated_in() -> None:
    """`weight_used = n_calls`, because this bucket's published ceiling IS in calls.

    Not `WEIGHT_NOT_READABLE`: that sentinel means "no way to price the call", and here the
    price is one unit per call by the definition of the unit — 40 per sliding 60 s
    `[MEDIDO 2026-09-10, n=41 requisicoes]` — with the count kept locally because the bucket is
    BLIND. It is what lets `RNF-3`'s "<= 5% do teto" be checked against the record.
    """
    run = build_liquidation_history_run(
        started_at=_STARTED_AT,
        ended_at=_ENDED_AT,
        n_returned=7,
        n_calls=4,
        api_code=None,
        verdict="ACCEPTED",
        src_sha256=_SHA,
    )
    assert run.weight_used == 4


def test_the_run_leaves_n_written_for_the_writer_to_close() -> None:
    """`ADR-035/D2`: the collector OPENS the run, the single writer CLOSES it."""
    run = build_liquidation_history_run(
        started_at=_STARTED_AT,
        ended_at=_ENDED_AT,
        n_returned=7,
        n_calls=4,
        api_code=None,
        verdict="ACCEPTED",
        src_sha256=_SHA,
        run_id="run-42",
    )
    assert run.run_id == "run-42"
    assert run.n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS
    assert run.writer_accounted_at is None
    assert run.observer_id == LIQUIDATION_OBSERVER_ID
    assert run.clock_skew_ms == CLOCK_SKEW_NOT_MEASURED_MS
    assert run.n_expected == run.n_returned == 7


# ── THE ROW ───────────────────────────────────────────────────────────────────────────────


def test_the_two_cohorts_produce_two_distinct_identities() -> None:
    """Summing the legs would erase the signal — forced selling and forced buying are not one."""
    to_row = build_liquidation_history_to_row()
    ids = {
        to_row(_RECEIVED_AT, "BTCUSDT", cohort, _BUCKET_START, "10").series_key_id
        for cohort in COHORTS
    }
    assert len(ids) == 2


def test_the_row_identity_is_the_catalogs_and_not_a_second_construction() -> None:
    """One place decides the fifteen-term identity; this mapper reads it, never rebuilds it."""
    to_row = build_liquidation_history_to_row()
    row = to_row(_RECEIVED_AT, "BTCUSDT", "long", _BUCKET_START, "231.85")
    assert (
        row.series_key_id
        == coinalyze_liquidation_key("long", instrument_id="BTCUSDT").series_key_id()
    )


def test_the_bucket_start_becomes_the_end_labelled_grid() -> None:
    """`t` is the START (measured); the canonical grid is end-labelled, so the writer adds 60 s.

    ⚠️ And `SeriesKey.label_shift` is NOT applied here: it is a term of the identity `sha256`,
    never a transform a writer runs — the warning `open_interest_bucket_end` already carries.
    """
    to_row = build_liquidation_history_to_row()
    row = to_row(_RECEIVED_AT, "BTCUSDT", "long", _BUCKET_START, "231.85")
    assert row.bucket_end == (_BUCKET_START * 1000) + LIQUIDATION_BUCKET_MS
    assert row.event_time == row.bucket_end


def test_the_raw_digits_reach_the_row_untouched() -> None:
    """`ADR-034/D7`: `value_raw` is the provider's own string, never a re-rendered float."""
    to_row = build_liquidation_history_to_row()
    row = to_row(_RECEIVED_AT, "BTCUSDT", "long", _BUCKET_START, "231.85380000000004")
    assert row.value_raw == "231.85380000000004"


def test_the_row_is_final_and_observed() -> None:
    """Only settled buckets reach this mapper (`RS-3.4`), so the row is final and OBSERVED."""
    to_row = build_liquidation_history_to_row()
    row = to_row(_RECEIVED_AT, "BTCUSDT", "long", _BUCKET_START, "1")
    assert row.is_final is True
    assert row.provenance is Provenance.OBSERVED
    assert row.observer_id == LIQUIDATION_OBSERVER_ID
    assert row.source == LIQUIDATION_HISTORY_ENDPOINT
    assert row.observed_at == row.ingested_at == row.available_at == _RECEIVED_AT


def test_a_symbol_outside_the_universe_is_refused_rather_than_published() -> None:
    """A row for an unserved symbol would carry an identity the catalog never registered."""
    to_row = build_liquidation_history_to_row()
    with pytest.raises(UnknownLiquidationSymbolError, match="outside the configured universe"):
        to_row(_RECEIVED_AT, "DOGEUSDT", "long", _BUCKET_START, "1")
