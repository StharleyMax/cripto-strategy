"""QA falsifier: after `ADR-038`/`D1`, can `F-1` (the falsifier OF `D1`) still be computed?

History of this file, because the before/after is the point:

  * Written by QA against `a5f0c64` (PR #223) asserting that a LIVE poll still writes an
    `OBSERVED` row. It FAILED — that failure WAS the finding: `D1` stamps `MODELED` on every
    open-interest row, so an `F-1` filtering `availability_source = 'OBSERVED'` would freeze
    at the legacy rows and, after `D15` (TRUNCATE + reingest), return `rc=0` with ZERO lines
    — the falsifier of `D1` switched off by `D1`, the ambiguous signal `ADR-012` names.

  * The fix is NOT to move the stamp: `D1` for `STOCK` is correct, measured, and its mutants
    bite. The fix is that `F-1` reads `observed_at - bucket_end`, which the mapper preserves
    on purpose. `ADR-038` §5 was amended to do exactly that, per poll rather than per row.

So this file now pins the contract that keeps `F-1` ALIVE, and keeps the original finding as
an executable negative control instead of prose.

Run: `cd backend && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest \
  ../docs/context/cinco-metricas-do-core/gates/QA-ADR-038-D1-F1-probe.py -q --no-cov`
"""

from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_to_rows,
)

_GRID = 1_789_257_900_000  # a real 5-min bucket_end from md.series

# Production, measured per poll (`group by observed_at`, `min(observed_at-bucket_end)`) on
# `deploy-postgres-1` read-only: n_polls = 52, p99 = 85_187 ms, range 4_417..85_187 ms, every
# one inside (0, 300_000] `[MEDIDO 2026-09-13T00:36Z]`. These four span that range.
_LIVE_LAGS_MS = (4_417, 29_735, 58_692, 85_187)

_ONE_NATIVE_GRID_MS = 300_000


def _point(ts: int) -> dict[str, object]:
    return {
        "symbol": "BTCUSDT",
        "sumOpenInterest": "1.0",
        "sumOpenInterestValue": "1.0",
        "CMCCirculatingSupply": "0",
        "timestamp": ts,
    }


def _row(lag_ms: int):
    return build_open_interest_to_rows()(_GRID + lag_ms, "BTCUSDT", [_point(_GRID)])[0]


def test_observed_at_keeps_the_fetch_instant_so_f_1_stays_computable() -> None:
    """`F-1`'s universe is NON-EMPTY after `D1` — this is the fix, stated as a measurement."""
    for lag_ms in _LIVE_LAGS_MS:
        row = _row(lag_ms)
        measured = row.observed_at - row.bucket_end
        assert measured == lag_ms, (
            f"`ADR-038` §5/`F-1` reads `observed_at - bucket_end` per poll; a live poll "
            f"{lag_ms} ms after the bucket must reproduce {lag_ms}, got {measured}. If this "
            f"fails, `observed_at` moved onto the stamp (that is §7.1, the OWNER's call) and "
            f"`F-1` has NO remaining column carrying the real fetch delay ⇒ rc=0 over an "
            f"empty universe, the ambiguous signal `ADR-012` names"
        )


def test_the_measured_lags_are_inside_the_band_d1_assumes() -> None:
    """The corrected premise: `p99_lag` IS measurable, and it SUPPORTS `D1` rather than not."""
    for lag_ms in _LIVE_LAGS_MS:
        row = _row(lag_ms)
        measured = row.observed_at - row.bucket_end
        assert 0 < measured <= _ONE_NATIVE_GRID_MS, (
            f"{measured} ms is outside (0, {_ONE_NATIVE_GRID_MS}] — the band in which "
            f"`ADR-038` §3 shows EVERY percentile yields the same `+300.000` stamp. Outside "
            f"it, `D1` needs re-deciding, not re-measuring"
        )


def test_the_old_observed_filter_would_indeed_have_been_dead() -> None:
    """The ORIGINAL finding, kept executable: the `OBSERVED` filter really does select nothing.

    This is the negative control for the two tests above. If this ever starts stamping
    `OBSERVED` again, `D1` was reverted and `ADR-038` §5 must go back to the cheaper query.
    """
    for lag_ms in _LIVE_LAGS_MS:
        assert _row(lag_ms).availability_source is AvailabilitySource.MODELED, (
            "a live poll is stamped MODELED by `D1` — this is why `ADR-038` §5/`F-1` may NOT "
            "filter on `availability_source = 'OBSERVED'`"
        )
