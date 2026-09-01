"""Read `daily/metrics` CSV files and turn a domain `MetricsGap` into a persistable `IngestGap`."""

from __future__ import annotations

import csv
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from src.modules.sentimento.domain.ingest_record import IngestGap
from src.modules.sentimento.domain.metrics_shift import (
    RAW_METRICS_COLUMNS,
    MetricsGap,
    RawMetricsRow,
)

# ── WHY THIS BOUNDARY IS INFRA, NOT DOMAIN ─────────────────────────────────────────────────
#
# The two operations that need a clock — parsing `create_time` and formatting `event_time`
# back to an ISO string — live HERE and not in `domain.metrics_shift`, because the `Natureza`
# contract (`backend/pyproject.toml [tool.importlinter]`) forbids `domain` and `use_cases` from
# importing `datetime`. `infra` is where an instant stops being an opaque integer and starts
# being read off, or written back to, the outside world.

# `daily/metrics` timestamps carry no offset in the file. `SPEC-001` §2.2 treats every instant
# in this pipeline as UTC — the same convention the REST endpoints this data mirrors publish
# in — so parsing without a timezone and then attaching UTC explicitly is the read, not an
# assumption invented here.
_CREATE_TIME_FORMAT: str = "%Y-%m-%d %H:%M:%S"

# `SOURCE_GAP`: the upstream dump itself has the hole (measured on the vendor's own file,
# `D4.2`), as opposed to a gap this collector caused by being offline. Matches the literal
# spelling already fixed by `tests/sentimento/test_ingest_health_contract_guards.py::_gap` and
# `test_ingest_health_query.py::_gap` — this module does not invent a second vocabulary for the
# same column; `md.ingest_gap.class` has no enum of its own yet (open question, not this task's
# to close), so the string is the shared point of agreement until one exists.
SOURCE_GAP_CLASS: str = "SOURCE_GAP"


def parse_create_time_ms(raw: str) -> int:
    """Parse the file's wall-clock string as UTC epoch milliseconds.

    The ONLY place in this pipeline allowed to call `datetime.strptime` — `domain` cannot
    (`Natureza`), and `RawMetricsRow.create_time_ms` is the injected value this produces.
    """
    parsed = datetime.strptime(raw, _CREATE_TIME_FORMAT).replace(tzinfo=UTC)
    return int(parsed.timestamp() * 1000)


def format_event_time_iso(event_time_ms: int) -> str:
    """Render an `event_time` epoch as the `...Z` ISO shape `md.ingest_gap` already uses.

    The shape (`YYYY-MM-DDTHH:MM:SSZ`) is not a stylistic pick: it is the exact spelling
    `test_ingest_health_query.py::_gap` and `test_ingest_health_contract_guards.py::_gap`
    already pinned for `from_ts`/`to_ts` before this task existed.
    """
    return datetime.fromtimestamp(event_time_ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_raw_metrics_rows(path: Path) -> tuple[RawMetricsRow, ...]:
    """Read one `daily/metrics` CSV file into `RawMetricsRow`, in FILE order — unsorted.

    Returning FILE order on purpose: sorting is `domain.metrics_shift.label_and_sort_metrics_
    rows`'s job (`plano 04` item 4.2), and a reader that sorted before handing rows over would
    make it impossible to write the regression test that proves the sort is mandatory.
    """
    rows: list[RawMetricsRow] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        if header is None or tuple(header) != RAW_METRICS_COLUMNS:
            raise ValueError(
                f"{path}: header {header} does not match the eight declared columns "
                f"{RAW_METRICS_COLUMNS}"
            )
        for record in reader:
            rows.append(
                RawMetricsRow(
                    create_time_ms=parse_create_time_ms(record["create_time"]),
                    create_time_raw=record["create_time"],
                    symbol=record["symbol"],
                    sum_open_interest=Decimal(record["sum_open_interest"]),
                    sum_open_interest_value=Decimal(record["sum_open_interest_value"]),
                    count_toptrader_long_short_ratio=Decimal(
                        record["count_toptrader_long_short_ratio"]
                    ),
                    sum_toptrader_long_short_ratio=Decimal(
                        record["sum_toptrader_long_short_ratio"]
                    ),
                    count_long_short_ratio=Decimal(record["count_long_short_ratio"]),
                    sum_taker_long_short_vol_ratio=Decimal(
                        record["sum_taker_long_short_vol_ratio"]
                    ),
                )
            )
    return tuple(rows)


def build_ingest_gap(
    gap: MetricsGap,
    *,
    source: str,
    symbol: str,
    series_key_id: str,
    detected_at: str,
) -> IngestGap:
    """Attach the identity and the clock `domain.MetricsGap` cannot carry, ready to persist.

    `detected_at` is INJECTED (`use_cases`/`domain` cannot read a clock either) — the caller
    that runs the actual ETL is where "now" is allowed to mean something.
    """
    return IngestGap(
        source=source,
        symbol=symbol,
        series_key_id=series_key_id,
        from_ts=format_event_time_iso(gap.from_event_time),
        to_ts=format_event_time_iso(gap.to_event_time),
        n_missing=gap.n_missing,
        gap_class=SOURCE_GAP_CLASS,
        detected_at=detected_at,
    )
