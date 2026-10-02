"""`scripts/md-series-compaction/compact.sh`: the `DELETE` of `T-06.4-prova.md` §3, on a test DB.

The script is run by the orchestrator against the LOCAL Docker Postgres only, after the T-06.4
writer is deployed (owner's decision at the end of `T-06.4-prova.md`). It is NEVER run here
against the shared database: these tests seed a throwaway TimescaleDB and execute the EXACT SQL
the script sends — `compact.sh print-sql …` prints it, the test runs that text.

WHAT IS PROVEN, AND WHAT EACH CHECK ANSWERS:

* the SQL predicate selects exactly the rows the WRITER's predicate (`repeats_predecessor_fact`)
  would have skipped, minus the buckets with `available_at` going down — the writer and the
  `DELETE` use the same form (§1.5), checked against an independent Python replay;
* every `FACT_COLUMNS` entry is in the SQL (partition key or `lag()` comparison);
* per chunk, selected == deleted; after the `DELETE`, F-B holds: rows per source = survivors
  before, nothing left to select, the fingerprint/q1/F-1 lines identical;
* `as_of_batch` over the rows read back answers the same before and after (the F-A analogue);
* ABLATION: deleting the 1st observation of a repeated bucket instead of the 2nd keeps the
  per-source count right but moves the fingerprint AND an `as_of` answer — F-B.2 and F-A bite.
"""

from __future__ import annotations

import dataclasses
import re
import subprocess
from collections import defaultdict
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from typing import Final

import psycopg
import pytest

from src.modules.sentimento.domain.as_of_accessor import (
    BarPolicy,
    Observation,
    ReadPurpose,
    SeriesReadPolicy,
    as_of_batch,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.repeated_fact import (
    FACT_COLUMNS,
    RecordedObservation,
    repeats_predecessor_fact,
)
from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
from tests.helpers.postgres import PostgresDatabase

_SCRIPT: Final = Path(__file__).resolve().parents[3] / "scripts/md-series-compaction/compact.sh"
_FLAGS_SQL: Final = _SCRIPT.parent / "flags.sql"
_OI_ID: Final = "94c3d3dd5f45abcb801a53e4a8b52ea81ea2479a9cdd51d90cd2cb6895e1a4a9"
_BUCKET_MS: Final = 1_787_443_499_999
_EVENT_MS: Final = 1_787_443_500_000
_STEP_MS: Final = 60_000
_WEEK_MS: Final = 7 * 24 * 3_600_000
_T_SNAP: Final = _EVENT_MS + 30 * 24 * 3_600_000

_COLUMNS: Final = (
    "series_key_id, symbol, source, bucket_end, event_time, available_at, availability_source, "
    "ingested_at, observed_at, provenance, src_label_raw, observer_id, observer_region, "
    "is_final, principal_id, value_raw"
)


def _sql(*args: str) -> str:
    return subprocess.run(
        ["bash", str(_SCRIPT), "print-sql", *args], check=True, capture_output=True, text=True
    ).stdout


def _row(bucket: int, k: int, **overrides: object) -> SeriesRow:
    """Observation `k` (5 min apart) of bucket `bucket` (minutes from the base, may be weeks)."""
    columns: dict[str, object] = {
        "series_key_id": _OI_ID,
        "symbol": "BTCUSDT",
        "source": "binance_klines",
        "bucket_end": _BUCKET_MS + bucket * _STEP_MS,
        "event_time": _EVENT_MS + bucket * _STEP_MS,
        "available_at": _EVENT_MS + bucket * _STEP_MS + 30_000 + k * 300_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": _EVENT_MS + bucket * _STEP_MS + 31_000 + k * 300_000,
        "observed_at": _EVENT_MS + bucket * _STEP_MS + 31_000 + k * 300_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "kline",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "10",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def _seed() -> list[SeriesRow]:
    """Legacy rows as the pre-T-06.4 writer left them: every shape §3.3 names, in 2 chunks."""
    rows: list[SeriesRow] = []
    week = _WEEK_MS // _STEP_MS
    for base in (0, 2 * week):  # two hypertable chunks (7 d each)
        rows += [_row(base + 0, k) for k in range(5)]  # plain re-poll: 4 repeats
        rows += [_row(base + 1, k, value_raw=v) for k, v in enumerate(["5", "0", "5", "5"])]
        rows += [_row(base + 2, k, value_raw=v) for k, v in enumerate(["1", "1", "2", "2", "1"])]
        rows += [_row(base + 3, 0, value_raw="0"), _row(base + 3, 1, value_raw="0")]
        rows += [_row(base + 4, k, is_final=None, principal_id=None) for k in range(3)]
    # an openInterestHist-like inverted bucket: OBSERVED repeats, then MODELED published earlier.
    inverted = [_row(7, k, source="oih", value_raw="3") for k in range(3)]
    inverted.append(
        _row(
            7,
            3,
            source="oih",
            value_raw="3",
            availability_source=AvailabilitySource.MODELED,
            available_at=_EVENT_MS + 7 * _STEP_MS + 1,
        )
    )
    rows += inverted
    # a repeat ingested AFTER the snapshot: outside the frozen universe, never touched.
    late = _row(0, 9)
    rows.append(dataclasses.replace(late, ingested_at=_T_SNAP + 1, observed_at=_T_SNAP + 1))
    return rows


def _pk(row: SeriesRow) -> tuple[str, str, str, int, int]:
    return (row.series_key_id, row.symbol, row.source, row.bucket_end, row.observed_at)


def _oracle(rows: list[SeriesRow]) -> set[tuple[str, str, str, int, int]]:
    """Independent replay of §3.1 with the WRITER's predicate — not the SQL."""
    buckets: dict[tuple[str, str, str, int], list[SeriesRow]] = defaultdict(list)
    for row in rows:
        if row.ingested_at <= _T_SNAP:
            buckets[_pk(row)[:4]].append(row)
    selected = set()
    for members in buckets.values():
        members.sort(key=lambda r: r.observed_at)
        pairs = list(zip(members, members[1:], strict=False))
        if any(p.available_at > r.available_at for p, r in pairs):
            continue
        selected |= {
            _pk(r) for p, r in pairs if repeats_predecessor_fact(r, RecordedObservation.of(p))
        }
    return selected


@pytest.fixture
def seeded(postgres_database: PostgresDatabase) -> Iterator[psycopg.Connection]:
    """Yield a fresh hypertable holding `_seed()`, through the production sink."""
    with postgres_database.connect() as conn:
        ensure_schema(conn)
        sink = PostgresSeriesSink(conn)
        for row in _seed():
            sink.accept(row)
        yield conn


def _query(conn: psycopg.Connection, text: str) -> list[tuple[object, ...]]:
    with conn.cursor() as cursor:
        cursor.execute(text.encode())
        result = cursor.fetchall()
    conn.commit()
    return result


def _stats(conn: psycopg.Connection) -> dict[tuple[str, str], tuple[str, str, str]]:
    return {
        (str(kind), str(key)): (str(a), str(b), str(c))
        for kind, key, a, b, c in _query(conn, _sql("stats", str(_T_SNAP)))
    }


def _rows(conn: psycopg.Connection) -> list[SeriesRow]:
    rows = []
    for record in _query(conn, f"SELECT {_COLUMNS} FROM md.series"):  # noqa: S608
        values = dict(zip([c.strip() for c in _COLUMNS.split(",")], record, strict=True))
        values["availability_source"] = AvailabilitySource(values["availability_source"])
        values["provenance"] = Provenance(values["provenance"])
        rows.append(SeriesRow(**values))  # type: ignore[arg-type]
    return rows


def _delete_all_chunks(conn: psycopg.Connection) -> int:
    total = 0
    for lo, hi in _query(conn, _sql("chunks")):
        ((n_selected, n_deleted),) = _query(
            conn, _sql("delete-chunk", str(_T_SNAP), str(lo), str(hi))
        )
        assert n_selected == n_deleted
        total += int(str(n_deleted))
    return total


def _readings(rows: list[SeriesRow]) -> list[list[dict[str, object]]]:
    entry = list_pilot_series_catalog().entry_for_id(_OI_ID)
    assert entry is not None
    policy = SeriesReadPolicy(
        asof_max_staleness_ms=600_000,
        render_max_staleness_ms=600_000,
        bucket_interval_ms=_STEP_MS,
        first_capture_at=None,
    )
    observations = tuple(Observation(row=r, value=Decimal(r.value_raw)) for r in rows)
    instants = sorted({r.bucket_end + d for r in _seed() for d in (0, _STEP_MS - 1)})
    knowledge = sorted(
        {r.observed_at + d for r in _seed() for d in (-1, 0, 150_000)}
        | {r.available_at + d for r in _seed() for d in (-1, 0)}
    )
    return [
        [
            reading.projection()
            for reading in as_of_batch(
                series=entry.key,
                symbol="BTCUSDT",
                instants=instants,
                observations=observations,
                policy=policy,
                bar_policy=BarPolicy.FINAL_ONLY,
                purpose=ReadPurpose.RENDERING,
                knowledge_time=k,
            )
        ]
        for k in knowledge
    ]


def test_every_fact_column_is_a_partition_key_or_a_lag_comparison() -> None:
    """The writer's `FACT_COLUMNS` and the `DELETE`'s SQL cannot diverge in silence."""
    text = _FLAGS_SQL.read_text(encoding="utf-8")
    partition = re.search(r"WINDOW b AS \(PARTITION BY ([a-z_, ]+) ORDER BY observed_at\)", text)
    assert partition is not None
    keys = {c.strip() for c in partition.group(1).split(",")}
    compared = set(re.findall(r"lag\((\w+)\)\s+OVER b (?:=|IS NOT DISTINCT FROM) \1\b", text))

    assert keys == {"series_key_id", "symbol", "source", "bucket_end"}
    assert keys | compared == set(FACT_COLUMNS)
    assert "lag(available_at)        OVER b <= available_at" in text


def test_the_sql_selects_exactly_what_the_writer_predicate_would_have_skipped(
    seeded: psycopg.Connection,
) -> None:
    """SQL `flags` == the Python replay of `repeats_predecessor_fact` + the inversion guard."""
    flagged = _query(seeded, _sql("flags", str(_T_SNAP)))
    selected = {tuple(r[:5]) for r in flagged if r[7]}

    assert selected == _oracle(_seed())
    assert len(selected) == 2 * (4 + 1 + 2 + 1 + 2)  # per chunk; the inverted bucket keeps all


def test_the_delete_satisfies_f_b_and_leaves_every_as_of_answer_unchanged(
    seeded: psycopg.Connection,
) -> None:
    """Count → delete per chunk → count: F-B.1, F-B.2, F-B.3, and the `as_of` grid."""
    before = _stats(seeded)
    readings_before = _readings(_rows(seeded))
    n_rows_before = len(_rows(seeded))

    deleted = _delete_all_chunks(seeded)
    after = _stats(seeded)

    assert deleted == int(before[("source", "binance_klines")][1]) == 20
    assert len(_rows(seeded)) == n_rows_before - 20
    for (kind, key), (_, _, survivors) in before.items():
        if kind == "source":
            assert after[(kind, key)] == (survivors, "0", survivors)
    for kind in ("fingerprint", "q1", "f1"):
        lines = [v for (k, _), v in before.items() if k == kind]
        assert lines == [v for (k, _), v in after.items() if k == kind]
    assert before[("f1", "buckets_zero_before_nonzero")][0] == "2"
    assert _readings(_rows(seeded)) == readings_before


def test_a_delete_of_the_first_observation_instead_moves_the_fingerprint_and_as_of(
    seeded: psycopg.Connection,
) -> None:
    """ABLATION: same row count as the right `DELETE`, wrong row ⇒ F-B.2 and F-A both bite."""
    before = _stats(seeded)
    readings_before = _readings(_rows(seeded))
    first, second = _row(3, 0, value_raw="0"), _row(3, 1, value_raw="0")
    assert _pk(second) in _oracle(_seed())

    with seeded.cursor() as cursor:  # the 1st observation, not the selected 2nd
        cursor.execute(
            "DELETE FROM md.series WHERE series_key_id = %s AND symbol = %s AND source = %s "
            "AND bucket_end = %s AND observed_at = %s",
            _pk(first),
        )
    seeded.commit()
    after = _stats(seeded)

    assert after[("fingerprint", "survivors")] != before[("fingerprint", "survivors")]
    assert _readings(_rows(seeded)) != readings_before
