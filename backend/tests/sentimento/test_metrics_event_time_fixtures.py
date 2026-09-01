"""`D4.1`/`D4.2`/`D4.3`, run against the real `daily/metrics` dumps the plan pins by `md5`.

`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md`. Every number asserted below
was measured on this exact fixture by this test's own logic —
`[MEDIDO 2026-08-29]`, command: `bash backend/scripts/test.sh -k test_metrics_event_time_fixtures`
over `data/binance/metrics/btcusdt/{2026-08-12,2026-08-18,2026-08-23}.csv` — and the docstrings
say which plan/PRD number each assertion corresponds to.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from src.modules.sentimento.domain.ingest_record import IngestGap
from src.modules.sentimento.domain.metrics_shift import (
    LABEL_SHIFT_MS,
    RawMetricsRow,
    detect_gaps,
    label_and_sort_metrics_rows,
    label_metrics_row,
)
from src.modules.sentimento.infra.metrics_csv_reader import (
    build_ingest_gap,
    format_event_time_iso,
    read_raw_metrics_rows,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from tests.helpers.data_fixtures import require_fixture

_GRID_MS = 300_000  # 5-minute grid `daily/metrics` publishes on.

_FIXTURE_2026_08_18 = "binance/metrics/btcusdt/2026-08-18.csv"
_MD5_2026_08_18 = "b8ef79c353f2adce853c68084cc3b631"

_FIXTURE_2026_08_12 = "binance/metrics/btcusdt/2026-08-12.csv"
_MD5_2026_08_12 = "bf1ddd8ba4248f975e92daae23ee3dc3"

_FIXTURE_2026_08_23 = "binance/metrics/btcusdt/2026-08-23.csv"
_MD5_2026_08_23 = "fc8c0fba983194cf356a7d172b3bd39e"


# ── D4.1 — ordenação é ETL, e bypassá-la reprova ────────────────────────────────────────────


def test_d4_1_the_file_reads_288_rows_and_is_not_already_ordered() -> None:
    """The file `plano 04` pins by `md5` — `CA-F1-1`'s "13 de 30 dias fora de ordem" context.

    `[MEDIDO]`: 288 rows, and file order is NOT `create_time` order — this is the fact that
    makes `D4.1` a real test rather than a tautology on an already-sorted fixture.
    """
    path = require_fixture(_FIXTURE_2026_08_18, expected_md5=_MD5_2026_08_18)
    raw_rows = read_raw_metrics_rows(path)
    assert len(raw_rows) == 288
    file_order = [row.create_time_ms for row in raw_rows]
    assert file_order != sorted(file_order)


def test_d4_1_max_positional_displacement_is_275_of_288() -> None:
    """`[MEDIDO 2026-08-29]`: the number `plano 04`'s D4.1 row quotes verbatim — 275 of 288.

    Comando: posição de cada linha (ordem do arquivo) menos a posição da mesma linha depois de
    ordenada por `create_time`, máximo do valor absoluto, sobre
    `data/binance/metrics/btcusdt/2026-08-18.csv`.
    """
    path = require_fixture(_FIXTURE_2026_08_18, expected_md5=_MD5_2026_08_18)
    raw_rows = read_raw_metrics_rows(path)
    file_order = [row.create_time_ms for row in raw_rows]
    sorted_order = sorted(file_order)
    position_in_sorted = {value: index for index, value in enumerate(sorted_order)}
    max_displacement = max(
        abs(position_in_sorted[value] - index) for index, value in enumerate(file_order)
    )
    assert max_displacement == 275


def test_d4_1_labeling_through_the_mandatory_path_is_monotonic() -> None:
    """The sanctioned entry point (`label_and_sort_metrics_rows`) always yields order."""
    path = require_fixture(_FIXTURE_2026_08_18, expected_md5=_MD5_2026_08_18)
    raw_rows = read_raw_metrics_rows(path)
    labeled = label_and_sort_metrics_rows(raw_rows)
    event_times = [row.event_time for row in labeled]
    assert event_times == sorted(event_times)
    assert len(event_times) == len(set(event_times))  # 5-min grid, no duplicate bucket


def test_d4_1_bypassing_the_sort_reproves_on_this_exact_fixture() -> None:
    """The mutant: label in FILE order (skip `label_and_sort_metrics_rows`) — reprova.

    This is the falsifier the DoD asks for, run on the real fixture rather than a synthetic
    one: reading the file, labeling row by row with `label_metrics_row` directly (the same
    call `label_and_sort_metrics_rows` makes internally, minus the `sorted(...)`), and checking
    monotonicity FAILS. That is the exact defect a caller who "forgot" to route through the
    mandatory function would ship.
    """
    path = require_fixture(_FIXTURE_2026_08_18, expected_md5=_MD5_2026_08_18)
    raw_rows = read_raw_metrics_rows(path)
    bypassed_event_times = [label_metrics_row(raw).event_time for raw in raw_rows]
    assert bypassed_event_times != sorted(bypassed_event_times)


# ── D4.2 — a lacuna não é preenchida ────────────────────────────────────────────────────────


def test_d4_2_the_gap_day_has_285_rows_after_labeling() -> None:
    """`[MEDIDO]`: 285 data rows — `plano 04` D4.2. No row is added to cover the gap."""
    path = require_fixture(_FIXTURE_2026_08_12, expected_md5=_MD5_2026_08_12)
    raw_rows = read_raw_metrics_rows(path)
    labeled = label_and_sort_metrics_rows(raw_rows)
    assert len(labeled) == 285


def test_d4_2_exactly_one_gap_with_n_missing_3_between_11_45z_and_12_05z() -> None:
    """`CA-F1-2`, literal: one vão de 20 min, `event_time` `11:45Z`→`12:05Z`, `n_missing=3`.

    Raw `create_time` jumps from 11:40 to 12:00 (the three buckets 11:45/11:50/11:55 are
    absent from the source); `+300000` ms shifts both ends by 5 minutes, landing on the exact
    ISO strings `test_ingest_health_query.py`/`test_ingest_health_contract_guards.py` already
    use as their `_gap()` fixture — this test is what makes those two fixtures a MEASUREMENT
    instead of an invented example.
    """
    path = require_fixture(_FIXTURE_2026_08_12, expected_md5=_MD5_2026_08_12)
    raw_rows = read_raw_metrics_rows(path)
    labeled = label_and_sort_metrics_rows(raw_rows)
    gaps = detect_gaps(labeled, grid_ms=_GRID_MS)
    assert len(gaps) == 1
    (gap,) = gaps
    assert gap.n_missing == 3
    ingest_gap = build_ingest_gap(
        gap,
        source="binance-futures",
        symbol="BTCUSDT",
        series_key_id="oi-5m",
        detected_at="2026-08-29T00:00:00Z",
    )
    assert ingest_gap.from_ts == "2026-08-12T11:45:00Z"
    assert ingest_gap.to_ts == "2026-08-12T12:05:00Z"


def test_d4_2_zero_points_interpolated_and_the_gap_persists_through_the_real_store(
    tmp_path: Path,
) -> None:
    """`plano 04` item 4.4: persisted (`md.ingest_gap`), and the count of rows never grows.

    Round-trips through the SAME `SqliteIngestRecordStore` the `ingest_health` CLI reads, so
    "persistido" is proven by the concrete adapter and not by a hand-rolled double.
    """
    path = require_fixture(_FIXTURE_2026_08_12, expected_md5=_MD5_2026_08_12)
    raw_rows = read_raw_metrics_rows(path)
    labeled = label_and_sort_metrics_rows(raw_rows)
    rows_before_persisting_the_gap = len(labeled)

    gaps = detect_gaps(labeled, grid_ms=_GRID_MS)
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    for gap in gaps:
        store.record_gap(
            build_ingest_gap(
                gap,
                source="binance-futures",
                symbol="BTCUSDT",
                series_key_id="oi-5m",
                detected_at="2026-08-29T00:00:00Z",
            )
        )

    persisted: tuple[IngestGap, ...] = store.gaps()
    assert len(persisted) == 1
    assert persisted[0].n_missing == 3
    # The row count is unaffected by persisting the gap: no synthetic row was ever created to
    # "fill" it, only a record that says one is missing.
    assert len(labeled) == rows_before_persisting_the_gap == 285


# ── D4.3 — o carimbo é do FECHO do bucket, nunca do início ─────────────────────────────────


def test_d4_3_the_first_event_time_of_2026_08_23_is_the_bucket_close() -> None:
    """`plano 04` D4.3, literal: `00:05:00Z`, never `00:00:00Z`.

    File order's first row is `create_time` 00:10:00 (this file is itself one of the 13
    out-of-order days) — the sort is what surfaces the TRUE first bucket, `00:00:00`, before
    the shift turns it into the close-of-bucket label `00:05:00Z`.
    """
    path = require_fixture(_FIXTURE_2026_08_23, expected_md5=_MD5_2026_08_23)
    raw_rows = read_raw_metrics_rows(path)
    assert raw_rows[0].create_time_raw == "2026-08-23 00:10:00"  # file order is NOT time order

    labeled = label_and_sort_metrics_rows(raw_rows)
    first = labeled[0]
    assert first.src_label_raw == "2026-08-23 00:00:00"
    assert first.event_time - LABEL_SHIFT_MS == _min_create_time_ms(raw_rows)

    assert format_event_time_iso(first.event_time) == "2026-08-23T00:05:00Z"
    assert format_event_time_iso(first.event_time) != "2026-08-23T00:00:00Z"


def _min_create_time_ms(raw_rows: Sequence[RawMetricsRow]) -> int:
    """Return the earliest `create_time_ms` across an unsorted sequence — a tiny local helper."""
    return min(row.create_time_ms for row in raw_rows)
