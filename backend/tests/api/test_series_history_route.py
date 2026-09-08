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

from src.api.dependencies import get_series_catalog_source, get_series_window_reader_source
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
        (SeriesCatalogEntry(key=_oi_key(), native_grid="1min", max_staleness_ms=120_000),)
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
    assert set(envelope["panel"]) == {"series_key_id", "source", "nature", "unit"}
    assert envelope["bar_policy"] == "final_only"
    assert len(envelope["rows"]) == 1
    row_wire = envelope["rows"][0]
    assert set(row_wire) == {"event_time", "available_at", "value", "absence"}
    # `CA-F1-5`: the discriminated pair is never malformed on the wire — exactly one of
    # value/absence is non-null, for every row (universe: N=1 row this fixture produced).
    assert (row_wire["value"] is None) != (row_wire["absence"] is None)
    assert row_wire["value"] == "1234.56"
    assert row_wire["absence"] is None


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


def test_interval_other_than_1m_is_refused_with_422(tmp_path: Path) -> None:
    """`CA-F1-3`/`RN-8`: `interval=5m` never `200` with a subestimated number."""
    app = _app_with_reader(tmp_path, _FakeReader())

    with _served(app) as port:
        status, _ = _get(port, _valid_query(interval="5m"))

    assert status == 422


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


def test_a_malformed_read_is_refused_with_a_named_500_never_served(tmp_path: Path) -> None:
    """`RN-9`: `AsOfReading` refused -> `500` named, never `200` with inconsistent data."""
    app = _app_with_reader(tmp_path, _RefusingReader())

    with _served(app) as port:
        status, body = _get(port, _valid_query())

    assert status == 500
    assert b"simulated malformed read" in body
