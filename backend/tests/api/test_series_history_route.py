"""`GET /series-history` over a REAL loopback socket — `CA-F1-1/2/3/5`, `SPEC-006 §5.2`.

Same idiom as `test_series_catalog_route.py`: `uvicorn.Server` on a daemon thread, a REAL
listener on `port=0`, `http.client` (stdlib) as the client. The catalog and the window reader
are both overridden via `app.dependency_overrides` — same "genuinely substitutable DI" proof
that file already runs for `get_series_catalog_source`.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from src.api.dependencies import (
    get_series_catalog_source,
    get_series_store_bounds_reader_source,
    get_series_window_reader_source,
)
from src.main import create_app
from src.modules.sentimento.domain.as_of_accessor import DecisionReadRefusedError, Observation
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0

SYMBOL = "BTCUSDT"
BUCKET_END_MS = 1_620_000_000_000


def _oi_key() -> SeriesKey:
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="BTCUSDT",
        metric="sum_open_interest",
        cohort="all",
        interval="5m",
        unit="BTC",
        denom="base",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_history_route.py",
    )


def _catalog() -> SeriesCatalog:
    return SeriesCatalog(
        (
            SeriesCatalogEntry(
                key=_oi_key(), native_grid="1min", native_grid_ms=60_000, max_staleness_ms=120_000
            ),
        )
    )


def _row() -> SeriesRow:
    return SeriesRow(
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        source="binance",
        bucket_end=BUCKET_END_MS,
        event_time=BUCKET_END_MS,
        available_at=BUCKET_END_MS,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=BUCKET_END_MS,
        observed_at=BUCKET_END_MS,
        provenance=Provenance.OBSERVED,
        src_label_raw="sumOpenInterest",
        observer_id="vps-01",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw="1234.56",
    )


class _FakeReader:
    """A `SeriesWindowReader` fixture: returns exactly the `Observation`s it was built with."""

    def __init__(self, observations: tuple[Observation, ...] = ()) -> None:
        self._observations = observations

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        return self._observations


class _RefusingReader:
    """A `SeriesWindowReader` that always refuses — the route's `500` case (`RN-9`)."""

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        raise DecisionReadRefusedError("simulated malformed read, for the route's 500 test")


class _FakeBoundsReader:
    """A `SeriesStoreBoundsReader` fixture: `(None, None)` — an empty store (`T-03.6`).

    This file's own domain is the envelope's 3-level SHAPE over a real socket, never
    `panel.coverage`'s resolved values — `test_source_floor.py` covers the resolver, and
    `test_series_history.py`'s use-case-level tests cover the store-extent wiring.
    """

    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        return (None, None)


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(_STARTUP_POLL_S)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=_JOIN_TIMEOUT_S)


def _app_with_reader(tmp_path: Path, reader: object) -> FastAPI:
    app = create_app(store_path=tmp_path / "ih.sqlite3")
    app.dependency_overrides[get_series_catalog_source] = _catalog
    app.dependency_overrides[get_series_window_reader_source] = lambda: reader
    app.dependency_overrides[get_series_store_bounds_reader_source] = _FakeBoundsReader
    return app


def _get(port: int, query: str) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", f"/api/v1/series-history?{query}")
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response.status, body


def _valid_query(**overrides: object) -> str:
    params: dict[str, object] = {
        "series_key_id": _oi_key().series_key_id(),
        "symbol": SYMBOL,
        "interval": "1m",
        "window_start_ms": BUCKET_END_MS,
        "window_end_ms": BUCKET_END_MS,
        "knowledge_time_ms": BUCKET_END_MS + 100_000,
        "bar_policy": "final_only",
    }
    params.update(overrides)
    return "&".join(f"{key}={value}" for key, value in params.items())


def test_get_series_history_serves_the_3_level_envelope(tmp_path: Path) -> None:
    """`CA-F1-1`: the route exists and serves `SPEC-006 §5.2`'s envelope, snake_case verbatim."""
    row = _row()
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    app = _app_with_reader(tmp_path, reader)

    with _served(app) as port:
        status, body = _get(port, _valid_query())

    assert status == 200
    envelope = json.loads(body)
    assert set(envelope) == {"session", "panel", "rows", "knowledge_time", "bar_policy"}
    assert set(envelope["session"]) == {"principal_id", "server_now_ms"}
    # `native_grid_ms`/`grid_multiple` joined the panel level with `ADR-037/D4`: the report
    # grid is fixed at 1 minute, so a series on a wider grid comes back as a staircase and the
    # envelope has to SAY so rather than let the consumer count repeated slots as bars.
    # `coverage` joined the panel level with `D8`/`D-C3.7` (`T-03.6`): the two walls that make
    # `beyond-coverage` distinguishable from `absent` (`PanelCoverage`, never `BucketCoverage`).
    assert set(envelope["panel"]) == {
        "series_key_id",
        "source",
        "nature",
        "unit",
        "native_grid_ms",
        "grid_multiple",
        "coverage",
    }
    assert set(envelope["panel"]["coverage"]) == {
        "earliest_bucket_ms",
        "latest_bucket_ms",
        "source_floor_ms",
    }
    # `_FakeBoundsReader` (this file's fixture) serves an EMPTY store; `_oi_key()`'s
    # `metric="sum_open_interest"`/`provider="binance"` resolves the `/futures/data/*` rolling
    # wall (`domain/source_floor.py`), never `None` — the wire round-trips both honestly.
    assert envelope["panel"]["coverage"]["earliest_bucket_ms"] is None
    assert envelope["panel"]["coverage"]["latest_bucket_ms"] is None
    assert envelope["panel"]["coverage"]["source_floor_ms"] is not None
    assert envelope["bar_policy"] == "final_only"
    assert len(envelope["rows"]) == 1
    row_wire = envelope["rows"][0]
    assert set(row_wire) == {"event_time", "available_at", "value", "absence", "coverage"}
    # `CA-F1-5`: the discriminated pair is never malformed on the wire — exactly one of
    # value/absence is non-null, for every row (universe: N=1 row this fixture produced).
    assert (row_wire["value"] is None) != (row_wire["absence"] is None)
    assert row_wire["value"] == "1234.56"
    assert row_wire["absence"] is None
    # `T-03.4`/`ADR-040/D3`: `coverage` is a REAGGREGATED-row concept — `interval == "1m"` here
    # is the native grid, never reaggregated, so the key is present but its value is `null`.
    assert row_wire["coverage"] is None


def test_two_identical_requests_produce_byte_identical_bodies(tmp_path: Path) -> None:
    """`CA-F1-2`: endereçável por conteúdo — same full key, same bytes, twice."""
    row = _row()
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    app = _app_with_reader(tmp_path, reader)
    query = _valid_query()

    with _served(app) as port:
        _, first_body = _get(port, query)
        _, second_body = _get(port, query)

    first = json.loads(first_body)
    second = json.loads(second_body)
    # `session.server_now_ms` is the ONE field allowed to vary between calls (the wall clock);
    # every other field is a pure function of the request key and must match byte for byte.
    del first["session"]["server_now_ms"]
    del second["session"]["server_now_ms"]
    assert first == second


def test_an_interval_outside_the_supported_set_is_refused_with_422(tmp_path: Path) -> None:
    """`CA-F1-3`/`RN-8` (`ADR-040/D1`, `T-03.3` DoD 5): `1d`/`3m`/`30s` never `200`, `n=3`.

    `ADR-040/D1` widened `ADR-034/D6`'s refused-against set from `{1m}` to
    `{1m,5m,15m,1h,4h}` — this pins the falsifier in the OTHER direction: a value still
    outside the widened set is refused for the same reason it always was.
    """
    app = _app_with_reader(tmp_path, _FakeReader())

    for interval in ("1d", "3m", "30s"):
        with _served(app) as port:
            status, _ = _get(port, _valid_query(interval=interval))
        assert status == 422, f"interval={interval!r} was not refused"


def test_every_member_of_the_widened_set_is_accepted_with_200(tmp_path: Path) -> None:
    """`ADR-040/D1`: none of the 5 served intervals is refused — the set GREW, `D6` intact."""
    row = _row()
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    app = _app_with_reader(tmp_path, reader)

    for interval in ("1m", "5m", "15m", "1h", "4h"):
        with _served(app) as port:
            status, _ = _get(port, _valid_query(interval=interval))
        assert status == 200, f"interval={interval!r} was refused"


def test_interval_15m_reaggregates_a_stock_series_to_its_last_native_fact(
    tmp_path: Path,
) -> None:
    """`ADR-040`'s falsifier item 2, end to end.

    `200` on `interval=15m` never subestimates — and for a `STOCK` series (`(STOCK, POINT)`,
    `reduce_bucket`'s `_last`) the served value is the LAST of the native facts the bucket
    covers, never their sum.
    """
    outer_end = BUCKET_END_MS
    values = (
        "10",
        "20",
        "30",
        "40",
        "50",
        "60",
        "70",
        "80",
        "90",
        "100",
        "110",
        "120",
        "130",
        "140",
        "150",
    )
    rows = tuple(
        SeriesRow(
            series_key_id=_oi_key().series_key_id(),
            symbol=SYMBOL,
            source="binance",
            bucket_end=outer_end - (len(values) - 1 - index) * 60_000,
            event_time=outer_end - (len(values) - 1 - index) * 60_000,
            available_at=outer_end - (len(values) - 1 - index) * 60_000 + 30_000,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=outer_end - (len(values) - 1 - index) * 60_000 + 30_000,
            observed_at=outer_end - (len(values) - 1 - index) * 60_000 + 30_000,
            provenance=Provenance.OBSERVED,
            src_label_raw="sumOpenInterest",
            observer_id="vps-01",
            observer_region=UNKNOWN_OBSERVER_REGION,
            is_final=True,
            value_raw=value,
        )
        for index, value in enumerate(values)
    )
    reader = _FakeReader(tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows))
    app = _app_with_reader(tmp_path, reader)

    with _served(app) as port:
        status, body = _get(
            port,
            _valid_query(interval="15m", window_start_ms=outer_end, window_end_ms=outer_end),
        )

    assert status == 200
    envelope = json.loads(body)
    assert len(envelope["rows"]) == 1
    assert envelope["rows"][0]["value"] == "150.0"
    # `T-03.4`/`ADR-040/D3` (`P-B`): the reaggregated row carries `coverage` on the wire, the
    # `{present, expected}` pair — full here, 15 distinct native facts of the 15 a `15m` bucket
    # spans over a `1m` native grid.
    assert envelope["rows"][0]["coverage"] == {"present": 15, "expected": 15}


def test_interval_5m_partial_coverage_carries_the_present_expected_pair_never_a_bool(
    tmp_path: Path,
) -> None:
    """`ADR-040/D3` (`P-B`), literal: `{"present": N, "expected": M}` — never a bool, never a %.

    Only 2 of the 5 native minutes the `5m` outer bucket spans carry a fact; the route still
    serves `200` with the partial `Σ`, and `coverage` says exactly how partial — never `true`/
    `false`, never a server-computed ratio that would throw the denominator away.
    """
    outer_end = BUCKET_END_MS
    present_offsets = (4, 0)  # native minutes -4 and 0 of the 5-minute group carry a fact
    rows = tuple(
        SeriesRow(
            series_key_id=_oi_key().series_key_id(),
            symbol=SYMBOL,
            source="binance",
            bucket_end=outer_end - offset * 60_000,
            event_time=outer_end - offset * 60_000,
            available_at=outer_end - offset * 60_000,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=outer_end - offset * 60_000,
            observed_at=outer_end - offset * 60_000,
            provenance=Provenance.OBSERVED,
            src_label_raw="sumOpenInterest",
            observer_id="vps-01",
            observer_region=UNKNOWN_OBSERVER_REGION,
            is_final=True,
            value_raw=value,
        )
        for offset, value in zip(present_offsets, ("1000", "9000"), strict=True)
    )
    reader = _FakeReader(tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows))
    app = _app_with_reader(tmp_path, reader)

    with _served(app) as port:
        status, body = _get(
            port,
            _valid_query(interval="5m", window_start_ms=outer_end, window_end_ms=outer_end),
        )

    assert status == 200
    row_wire = json.loads(body)["rows"][0]
    assert row_wire["value"] == "9000.0"  # `(STOCK, POINT)` = last — the more recent of the two
    assert isinstance(row_wire["coverage"], dict)  # never `True`/`False`
    assert row_wire["coverage"] == {"present": 2, "expected": 5}


def test_bar_policy_missing_is_refused_with_422(tmp_path: Path) -> None:
    """`bar_policy` has no default anywhere — absent from the query is a `422`, not `final_only`."""
    app = _app_with_reader(tmp_path, _FakeReader())
    query = _valid_query()
    query_without_bar_policy = "&".join(
        part for part in query.split("&") if not part.startswith("bar_policy=")
    )

    with _served(app) as port:
        status, _ = _get(port, query_without_bar_policy)

    assert status == 422


def test_bar_policy_outside_the_closed_set_is_refused_with_422(tmp_path: Path) -> None:
    """A `bar_policy` outside `{final_only, intrabar}` is `422`, never silently coerced."""
    app = _app_with_reader(tmp_path, _FakeReader())

    with _served(app) as port:
        status, _ = _get(port, _valid_query(bar_policy="secret_intrabar"))

    assert status == 422


def test_knowledge_time_in_the_future_is_refused_with_422(tmp_path: Path) -> None:
    """`knowledge_time_ms` after `server_now_ms` is `422` — a decision cannot know the future."""
    app = _app_with_reader(tmp_path, _FakeReader())
    far_future_ms = 4_102_444_800_000  # 2100-01-01T00:00:00Z

    with _served(app) as port:
        status, _ = _get(port, _valid_query(knowledge_time_ms=far_future_ms))

    assert status == 422


def test_unknown_series_key_id_is_refused_with_422(tmp_path: Path) -> None:
    """A `series_key_id` the catalog never priced is a client error, not a `500`/`200`."""
    app = _app_with_reader(tmp_path, _FakeReader())

    with _served(app) as port:
        status, _ = _get(port, _valid_query(series_key_id="does-not-exist"))

    assert status == 422


def test_a_window_starting_beyond_the_90_day_ceiling_is_refused_with_422(tmp_path: Path) -> None:
    """`D5`, item 5.3, `T-05.4`, plan `05` DoD 4: `MORDE` with `200`/`rows: []`, `n=2`.

    `91`/`400` days before `knowledge_time_ms` — the route's own `422` never a `200` with an
    empty `rows`, which is the `rc=0` ambiguity `ADR-012` names: indistinguishable between "no
    data" and "the instrument never reached that far". `_FakeReader()` here is the EMPTY-store
    reader every other `422` test in this file already uses — the refusal fires before the
    reader is ever asked, which is the whole point: an ambiguous `200` is never a possible
    outcome of this request, not merely an unlikely one.
    """
    app = _app_with_reader(tmp_path, _FakeReader())
    knowledge_time_ms = BUCKET_END_MS

    for days_before_ceiling in (91, 400):
        window_start_ms = knowledge_time_ms - days_before_ceiling * 86_400_000
        with _served(app) as port:
            status, body = _get(
                port,
                _valid_query(
                    window_start_ms=window_start_ms,
                    window_end_ms=knowledge_time_ms,
                    knowledge_time_ms=knowledge_time_ms,
                ),
            )
        assert status == 422, f"days_before_ceiling={days_before_ceiling} was not refused"
        # `CA-F1-5`-adjacent: the `422` body is the named `detail` string, never the envelope
        # shape a `200` would carry — no `"rows"` KEY (a JSON object member), regardless of the
        # refusal message's own prose (which legitimately spells out "rows: []" in English to
        # explain what it is refusing to serve).
        assert json.loads(body).keys() == {"detail"}


def test_a_window_starting_exactly_at_the_90_day_ceiling_is_served_with_200(
    tmp_path: Path,
) -> None:
    """The boundary itself is still servable — `D5` declares 90 days AS the ceiling, not before."""
    row = _row()
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    app = _app_with_reader(tmp_path, reader)
    knowledge_time_ms = BUCKET_END_MS
    window_start_ms = knowledge_time_ms - 90 * 86_400_000

    with _served(app) as port:
        status, _ = _get(
            port,
            _valid_query(
                window_start_ms=window_start_ms,
                window_end_ms=window_start_ms,
                knowledge_time_ms=knowledge_time_ms,
            ),
        )

    assert status == 200


def test_a_malformed_read_is_refused_with_a_named_500_never_served(tmp_path: Path) -> None:
    """`RN-9`: `AsOfReading` refused -> `500` named, never `200` with inconsistent data."""
    app = _app_with_reader(tmp_path, _RefusingReader())

    with _served(app) as port:
        status, body = _get(port, _valid_query())

    assert status == 500
    assert b"simulated malformed read" in body


def test_the_served_envelope_carries_the_grid_verdict_from_the_real_charts_rule(
    tmp_path: Path,
) -> None:
    """`ADR-037/D4`, end to end: `classify_grid_multiple` reaches the wire through `create_app`.

    `ADR-037`/M6 measured `classify_grid_multiple` with ZERO production callers — built, tested
    and never consulted. The adapter that gives it its first one lives in `src.main`
    (`_classify_panel_grid`), wired unconditionally into `app.dependency_overrides`, and this
    test exercises exactly that wiring: nothing here overrides the classifier, so a `200` whose
    panel carries `multiple_of_native` is proof the composition root wired it. Had it not, the
    stub in `src.api.dependencies` would raise and the route would answer `500`.
    """
    row = _row()
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    app = _app_with_reader(tmp_path, reader)

    with _served(app) as port:
        status, body = _get(port, _valid_query())

    assert status == 200
    panel = json.loads(body)["panel"]
    assert panel["native_grid_ms"] == 60_000
    assert panel["grid_multiple"] == {
        "enabled": True,
        "reason": "multiple_of_native",
        "multiple": 1,
    }
