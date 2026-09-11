"""`GET /series-catalog` over a REAL loopback socket — same idiom as `test_ready_route.py`.

`D3.1` (plan `03`): `curl -s $API$PREFIX/series-catalog | python3 -c '...print(d["n_entries"],
len(d["entries"]))'` must show the SAME number twice, and `grep -rn 'SELECT' backend/src/api |
wc -l` must be `0` (checked as a static grep in this task's QA gate report, not here — a pytest
cannot assert the ABSENCE of a SQL statement the handler never had a chance to write).

The number itself is `10`, not the `7` `SPEC-003`/`tasks.toml` write — see
`use_cases/series_catalog.py`'s own docstring and `test_series_catalog_use_case.py`'s
`test_the_real_catalog_has_ten_rows_not_seven` for the measured reason. This suite asserts `10`
(the REAL total), not `7`, because a route that quietly served 7 by dropping three real
Coinalyze rows would be the regression, not the fix.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI

from src.api.dependencies import get_series_catalog_source
from src.main import create_app
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


def _get_series_catalog(port: int) -> tuple[int, dict[str, object]]:
    """`GET /api/v1/series-catalog`, returning `(status, parsed body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/series-catalog")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


def test_get_series_catalog_serves_the_real_eleven_row_catalog_when_the_process_is_up(
    tmp_path: Path,
) -> None:
    """CALA: process up -> `200`, `n_entries == len(entries) == 11` — the REAL total.

    `store_path` here is `/ingest-health`'s dependency, irrelevant to this route (`0` SQL in the
    handler, `D5.13c`'s sibling restriction) — a fresh, uninitialised store still serves this
    route correctly, proving the catalog carries no coupling to the ingest-health store.

    Was `10` until `T-01.6` registered `klines_volume` (`SPEC-007` §4.5, `RF-2`). This is the
    HTTP-level half of that task's DoD — "`GET /api/v1/series-catalog` lista a entrada" — and
    it is asserted over a real socket against the real `create_app`, not against
    `list_series_catalog` directly, because the composition in `src/main/__init__.py:266` is
    itself a place the row could be lost.

    `RS-1` is checked in the same breath: the three top-level fields and the entry field names
    below are unchanged, so this task moved CONTENT (one more row) and not FORM.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    assert set(body) == {"query", "n_entries", "entries"}
    assert body["query"] == "series_catalog"
    assert body["n_entries"] == 11
    entries = body["entries"]
    assert isinstance(entries, list)
    assert len(entries) == 11

    served_metrics = [e["key"]["metric"] for e in entries]
    assert served_metrics.count("klines_volume") == 1
    assert served_metrics[-1] == "klines_volume"

    entry = entries[0]
    assert set(entry) == {
        "key",
        "nativeGrid",
        "maxStalenessMs",
        "priceUse",
        "reconstructedFrom",
        "publishedError",
    }
    key = entry["key"]
    assert set(key) == {
        "provider",
        "venue",
        "instrumentId",
        "metric",
        "cohort",
        "interval",
        "unit",
        "denom",
        "nature",
        "tsConvention",
        "reduction",
        "quantityField",
        "labelShift",
        "aggregationScope",
        "verifiedBy",
    }
    assert "completeness" not in body
    assert "completeness" not in entry


def test_get_series_catalog_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion."""
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/series-catalog")


def test_the_dependency_override_is_genuinely_substitutable(tmp_path: Path) -> None:
    """A test-injected catalog reaches the wire — proves this is real DI, not decorative.

    Overrides `get_series_catalog_source` with a ONE-row fixture catalog on the SAME app the
    other tests serve unmodified: if the route imported `list_series_catalog()` directly instead
    of reading the injected value, this override would have no effect and `n_entries` would
    still read `10` — the exact regression this test exists to catch.
    """
    store_path = tmp_path / "ih.sqlite3"
    app = create_app(store_path=store_path)
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="ETHUSDT",
        metric="klines_last",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.LAST,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_route.py",
    )
    fixture_catalog = SeriesCatalog(
        (SeriesCatalogEntry(key=key, native_grid="5min", max_staleness_ms=600_000),)
    )
    app.dependency_overrides[get_series_catalog_source] = lambda: fixture_catalog

    with _served(app) as port:
        status, body = _get_series_catalog(port)

    assert status == 200
    assert body["n_entries"] == 1
    assert body["entries"][0]["key"]["instrumentId"] == "ETHUSDT"  # type: ignore[index]
