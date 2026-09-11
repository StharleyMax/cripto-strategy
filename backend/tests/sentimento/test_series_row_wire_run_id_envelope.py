"""`ADR-035/D2`: the `run_id` travels with the batch, as an ENVELOPE key and not a 17th column.

Separate file from `test_series_row_wire.py` on purpose: that file pins the SIXTEEN-column row
shape `SPEC-004` §3.2 and `ADR-034/D7` fix, and the whole point of this decision is that the
run id is NOT part of it. Mixing the two would make the next reader of either file unsure which
contract a failure belongs to.

WHAT THE FALSIFIER IS HERE. `ADR-035`'s falsifier is "a run the writer settled while
`md.series` gained rows" — i.e. the run id did not survive the transport. The transport starts
in this module, so the tests below are the first place that can bite: `FIELD_NAMES` must stay
at 16, `encode(row)` with no run must stay byte-identical to what it produced before this
decision existed, and `decode` must keep refusing every unexpected key EXCEPT the one named
envelope field — a `decode` that started tolerating anything would swallow a producer's typo,
which is the same silence this decision exists to remove.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.series_row_wire import (
    FIELD_NAMES,
    RUN_ID_FIELD,
    InvalidWireFieldValueError,
    UnexpectedWireFieldError,
    decode,
    decode_run_id,
    encode,
)

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000
A_RUN_ID = "9f1c1f8e-0a4b-4c2e-8f2a-1b3c4d5e6f70"


def row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — same helper shape `test_series_row_wire.py` uses."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "78249.60000000",
    }
    columns.update(overrides)
    return SeriesRow(**columns)


def test_run_id_is_not_one_of_the_sixteen_series_row_columns() -> None:
    """`RS-2`/`ADR-034/D7`: the row shape does not grow because the transport learned a fact."""
    assert RUN_ID_FIELD not in FIELD_NAMES
    assert len(FIELD_NAMES) == 16


def test_encode_without_a_run_id_produces_exactly_the_sixteen_keys_it_always_did() -> None:
    """A producer not yet wired to `ADR-035` publishes the same bytes it published before."""
    assert set(encode(row()).keys()) == set(FIELD_NAMES)


def test_encode_with_a_run_id_appends_it_and_changes_nothing_else() -> None:
    """The envelope is ADDITIVE: same sixteen values, plus one key."""
    without = encode(row())
    with_run = encode(row(), run_id=A_RUN_ID)
    assert with_run[RUN_ID_FIELD] == A_RUN_ID
    assert {name: with_run[name] for name in FIELD_NAMES} == dict(without)


def test_decode_returns_the_same_row_whether_or_not_the_envelope_carries_a_run() -> None:
    """A `SeriesRow` has no run — `decode` must be blind to the envelope, not confused by it."""
    original = row()
    assert decode(encode(original, run_id=A_RUN_ID)) == original
    assert decode(encode(original)) == original


def test_decode_run_id_reads_back_exactly_what_encode_was_given() -> None:
    """The whole point: the id the collector opened the cycle with reaches the writer intact."""
    assert decode_run_id(encode(row(), run_id=A_RUN_ID)) == A_RUN_ID


def test_decode_run_id_is_none_when_the_producer_sent_no_run() -> None:
    """`None` means "this producer opens no run" — a reportable fact, never an exception."""
    assert decode_run_id(encode(row())) is None


def test_decode_still_refuses_a_key_that_is_neither_a_column_nor_the_envelope_field() -> None:
    """Tolerating ONE named envelope key is not tolerating anything: a typo still bites."""
    fields = dict(encode(row(), run_id=A_RUN_ID))
    fields["run_di"] = A_RUN_ID
    with pytest.raises(UnexpectedWireFieldError, match="run_di"):
        decode(fields)


def test_an_empty_run_id_on_the_wire_is_refused_rather_than_read_as_absent() -> None:
    """A blank id credits no run while LOOKING wired — the `rc=0` ambiguity `ADR-012` names."""
    fields = dict(encode(row()))
    fields[RUN_ID_FIELD] = ""
    with pytest.raises(InvalidWireFieldValueError, match=RUN_ID_FIELD):
        decode_run_id(fields)


def test_encode_refuses_to_put_an_empty_run_id_on_the_wire() -> None:
    """Refused at the producer too, so the blank id never reaches a stream in the first place."""
    with pytest.raises(InvalidWireFieldValueError, match=RUN_ID_FIELD):
        encode(row(), run_id="")
