"""`label_shift` PER ENDPOINT (`CA-F2-1`, plan `06` item 6.2): dump `create_time` vs REST.

Populates the real values for `SeriesKey.label_shift` (`series_key.py`, `T-06.1`) over the five
Binance endpoints `T-06.2` measures — it does not redefine the term, it is the ONE table that
resolves it per endpoint instead of by a global constant.

## Why a table, and not `metrics_shift.LABEL_SHIFT_MS` reused as-is

`metrics_shift.LABEL_SHIFT_MS` (`T-04.1`) is a DIFFERENT shift on a DIFFERENT axis:
`event_time = create_time + 300_000` labels EVERY row of `daily/metrics` by the CLOSE of its
own 5-minute bucket — one constant, applied once, to all eight columns of that one file. This
module answers a different question: for a given Binance REST endpoint, how does the SAME
instant's timestamp differ between the monthly S3 dump and the live REST response? The two
shifts happen to share the numeric value `300_000` for `openInterestHist` (measured below), but
sharing a number is not sharing a meaning — `SPEC-001` calls out exactly this confusion by name,
and `docs/context/plataforma-dados/handoff/T-06.2.md` repeats the warning for this task.

## The measurement, per endpoint — `[MEDIDO 2026-09-03]`

Command, run against real captures (`data/binance/metrics/btcusdt/2026-08-23.csv`, md5
`fc8c0fba983194cf356a7d172b3bd39e`; `data/binance/rest/rest_oi.json`, md5
`a3a941904ab9bbe27024929d157ca6d1` — same fixture `docs/recorte-plataforma.md`'s line 163 and
`test_metrics_event_time_fixtures.py` already pin):

    python3 -c "
    import csv, json
    from datetime import datetime, timezone
    def to_ms(s):
        fmt = '%Y-%m-%d %H:%M:%S'
        return int(datetime.strptime(s, fmt).replace(tzinfo=timezone.utc).timestamp() * 1000)
    rows = list(csv.DictReader(open('data/binance/metrics/btcusdt/2026-08-23.csv')))
    dump_ms = sorted(to_ms(r['create_time']) for r in rows)
    rest_ms = sorted(r['timestamp'] for r in json.load(open('data/binance/rest/rest_oi.json')))
    assert [d + 300_000 for d in dump_ms] == rest_ms
    "
    # -> exits 0, silently — the assertion holds: 288 dump rows, 288 REST rows, the shifted
    # SET equals the REST set exactly, and the paired `sum_open_interest` values match to MAE
    # 0.0 (see
    # `test_endpoint_shift_table.py::test_open_interest_hist_shift_matches_288_of_288_with_zero_mae`
    # for the executable, assertion-based form of this exact command).

`openInterestHist`, `topLongShortPositionRatio`, `topLongShortAccountRatio` and
`globalLongShortAccountRatio` all carry the SAME `+300_000` shift — verified against real
captures for three of the four (no `topLongShortPositionRatio` REST capture exists on disk;
`data/MANIFEST.md` does not catalog one). `takerlongshortRatio` is the measured EXCEPTION:
against `data/binance/rest/r_takerlongshortRatio.json`, shifting its dump column by `+300_000`
inflates the mean absolute error from ~0.0001 to ~0.62 (a taker `buySellRatio` of order 1.0) —
shifting it at all is measurably WRONG, not merely unverified.

## The sign, and why it is `+300_000` and not `-300_000`

`docs/context/plataforma-dados/handoff/T-06.2.md` describes the fact in REST-relative words:
"o dump tem timestamp REST − 5 min". Read as a formula that is `dump_ts = rest_ts − 300_000`,
i.e. `rest_ts = dump_ts + 300_000`. `SeriesKey.label_shift` (`series_key.py`) is defined to be
ADDED to the dump's own timestamp to reach the instant the value truly describes — the exact
convention `SPEC-001` §2.2 fixes for the Coinalyze case too ("o `label_shift` da Coinalyze é
`+interval`, na mesma direção do dump `metrics`"). So the term this table populates is
`+300_000`, not `-300_000`; the handoff's "REST − 5 min" names the same fact from the opposite
end, and `test_series_identity.py::test_label_shift_is_a_term_with_a_witness` already asserts
`+300_000` for this exact endpoint — this table agrees with code that predates it.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Final

# The five endpoints `CA-F2-1` names, transcribed verbatim from `docs/recorte-plataforma.md`'s
# "Alinhamento REST medido série a série" line and `plano 06` item 6.2. Four share one shift;
# `takerlongshortRatio` is the measured exception, and it is a DICTIONARY ENTRY, never a branch
# that treats "not in the four" as "no shift" — a sixth endpoint added later without its own
# measurement raises (`label_shift_for_endpoint`) instead of silently inheriting either value.
ENDPOINT_LABEL_SHIFT_MS: Final[dict[str, int]] = {
    "openInterestHist": 300_000,
    "topLongShortPositionRatio": 300_000,
    "topLongShortAccountRatio": 300_000,
    "globalLongShortAccountRatio": 300_000,
    "takerlongshortRatio": 0,
}


class UnknownEndpointShiftError(Exception):
    """An endpoint absent from `ENDPOINT_LABEL_SHIFT_MS` — refused, never resolved by default.

    `CA-F2-1` is literal that the `takerlongshortRatio` exception is applied PER ENDPOINT, never
    globally. A `.get(endpoint, 300_000)` would let a future endpoint nobody has measured yet
    silently inherit the majority shift, which is exactly the mistake this table exists to make
    structurally impossible: every name has to be measured and added on purpose.
    """


class MismatchedSeriesLengthError(Exception):
    """Two sequences that a comparison assumes are pointwise-aligned have different lengths."""


def label_shift_for_endpoint(endpoint: str) -> int:
    """Return the measured `label_shift`, in ms, for `endpoint`.

    Raises `UnknownEndpointShiftError` for anything not in `ENDPOINT_LABEL_SHIFT_MS` — see that
    exception's docstring for why a default would defeat the point of a table keyed per
    endpoint.
    """
    try:
        return ENDPOINT_LABEL_SHIFT_MS[endpoint]
    except KeyError as exc:
        raise UnknownEndpointShiftError(
            f"endpoint {endpoint!r} has no measured label_shift in ENDPOINT_LABEL_SHIFT_MS: "
            f"`CA-F2-1` requires the shift to be measured per endpoint before it is used, and "
            f"this name has never been measured"
        ) from exc


def shift_dump_timestamp_to_rest(dump_create_time_ms: int, *, endpoint: str) -> int:
    """Return the REST-equivalent timestamp for one dump row published by `endpoint`.

    `create_time_ms + label_shift_for_endpoint(endpoint)` — the same "add a constant" shape as
    `metrics_shift.shift_to_event_time`, reused here for a different axis (dump-vs-REST
    alignment, not create_time-vs-event_time) and a different, per-endpoint constant.
    """
    return dump_create_time_ms + label_shift_for_endpoint(endpoint)


def match_dump_to_rest_by_shifted_timestamp(
    dump_rows: Sequence[tuple[int, Decimal]],
    rest_rows: Sequence[tuple[int, Decimal]],
    *,
    shift_ms: int,
) -> tuple[tuple[Decimal, Decimal], ...]:
    """Join `dump_rows` to `rest_rows` on `dump_timestamp + shift_ms == rest_timestamp`.

    Returns one `(dump_value, rest_value)` pair per matched timestamp, in `dump_rows` order.
    Rows that do not find a partner on either side are silently dropped — by design: a REST
    capture window rarely covers the full dump day (the exact falsifier `CA-F2-1` names is the
    case where it DOES: `len(result) == len(dump_rows) == len(rest_rows)`, which is what
    "conjuntos de timestamp idênticos, 288 vs 288" means as code). A caller that needs "every
    dump row matched" compares `len()` of this return against `len(dump_rows)` itself; this
    function only pairs values, so a wrong `shift_ms` (or a missing exception) reduces the
    match count and/or raises the mean absolute error a caller computes over the result — it
    does not raise here, because "zero rows matched" is a valid, informative answer for a
    caller proving a shift is WRONG.

    A CAVEAT `[MEDIDO 2026-09-03]` a caller must not skip: on a REGULAR grid (`daily/metrics`
    publishes every 5 minutes, the same width as the shift itself), a WRONG `shift_ms` can
    still match most rows by grid periodicity alone — row `i`'s dump timestamp collides with
    row `i+1`'s REST timestamp under the wrong shift, giving a high match COUNT for the wrong
    reason. Matching on timestamp alone is therefore not a sufficient falsifier; a caller must
    also compare the paired VALUES (`mean_absolute_error` below) — a wrong shift matches almost
    as many rows but pairs each with the wrong instant's value.
    """
    rest_by_timestamp = dict(rest_rows)
    return tuple(
        (value, rest_by_timestamp[timestamp + shift_ms])
        for timestamp, value in dump_rows
        if timestamp + shift_ms in rest_by_timestamp
    )


def mean_absolute_error(observed: Sequence[Decimal], expected: Sequence[Decimal]) -> Decimal:
    """`mean(|observed_i - expected_i|)` over two already-aligned, equal-length sequences.

    Raises `MismatchedSeriesLengthError` rather than truncating with `zip`: a length mismatch
    means the caller paired the wrong rows, and silently averaging over the shorter sequence
    would hide exactly the alignment bug this function exists to catch.
    """
    if len(observed) != len(expected):
        raise MismatchedSeriesLengthError(
            f"observed has {len(observed)} values, expected has {len(expected)}: mean absolute "
            f"error over mismatched sequences would silently drop the unmatched rows"
        )
    if not observed:
        raise MismatchedSeriesLengthError(
            "mean_absolute_error requires at least one pair of values, got an empty sequence"
        )
    pairs = zip(observed, expected, strict=True)
    total = sum((abs(one - other) for one, other in pairs), Decimal(0))
    return total / Decimal(len(observed))
