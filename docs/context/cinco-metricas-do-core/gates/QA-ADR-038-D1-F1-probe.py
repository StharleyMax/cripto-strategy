"""QA falsifier: after `ADR-038`/`D1`, can `F-1` (the falsifier OF `D1`) still be computed?

`ADR-038` §5/`F-1` selects `availability_source = 'OBSERVED'` and waits for
`n_polls >= 1000`. This test asks whether the ONE writer of open-interest rows can still
produce such a row. It FAILS on `a5f0c64`, which is the finding.
"""

from src.modules.sentimento.domain.provenance import AvailabilitySource
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_to_rows,
)

_GRID = 1_789_257_900_000  # a real 5-min bucket_end from md.series


def _point(ts: int) -> dict[str, object]:
    return {
        "symbol": "BTCUSDT",
        "sumOpenInterest": "1.0",
        "sumOpenInterestValue": "1.0",
        "CMCCirculatingSupply": "0",
        "timestamp": ts,
    }


def test_a_live_poll_can_still_write_an_observed_row_so_f_1_can_ever_be_computed() -> None:
    # A LIVE poll: production measured these lags today, 4.417 ms .. 85.187 ms
    # (`n=40 polls`, `md.ingest_run` for the endpoint went from 1 run to 40 between
    # 2026-09-12T23:41Z and 2026-09-13T00:14Z).
    for lag_ms in (4_417, 29_735, 58_692, 85_187):
        row = build_open_interest_to_rows()(_GRID + lag_ms, "BTCUSDT", [_point(_GRID)])[0]
        assert row.availability_source is AvailabilitySource.OBSERVED, (
            f"lag {lag_ms} ms was OBSERVED in production, but the writer stamps "
            f"{row.availability_source.value}: `ADR-038` §5/`F-1` filters on OBSERVED, so its "
            f"universe can never grow past the legacy rows — and after `D15` (TRUNCATE) it "
            f"returns rc=0 with zero lines, the ambiguous signal `ADR-012` names"
        )
